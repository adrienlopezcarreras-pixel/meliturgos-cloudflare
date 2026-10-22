"""Read Kaggle session state; never download outputs, expose logs, or start GPU work."""
import contextlib
import datetime
import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SLUG = "mel-lora-uncensored-notebook-t4"


def evidence(state="UNAVAILABLE", code=None):
    return {
        "schema": "mel.kaggle-readonly-status.v1",
        "ok": code is None,
        "operation": "READ_ONLY_KERNEL_STATUS",
        "kernel_slug": SLUG,
        "session_status": state,
        "session_completed": state == "COMPLETE",
        "session_error_code": None,
        "session_diagnostics_status": "NOT_REQUESTED",
        # A session's completion is not proof that training ran or weights exist.
        "gpu_execution_verified": False,
        "weights_verified": False,
        "promotion_allowed": False,
        "error_code": code,
        "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def classify_session_error(text):
    # Fixed exception classes/markers only; never return provider messages,
    # paths, samples, account names, tracebacks or training data.
    clean = re.sub(r"\x1b\[[0-9;]*m", "", text[-65536:])
    patterns = [
        (r"(?m)^\s*(?:RuntimeError:\s*)?(TRAINING_BACKGROUND_(?:TIMEOUT|PROCESS_GONE|STALLED|NO_LOG))\b", None),
        (r"(?m)^\s*(?:[A-Za-z_.]*\.)?CellTimeoutError:", "KAGGLE_CELL_TIMEOUT"),
        (r"(?m)^\s*(?:torch\.cuda\.)?OutOfMemoryError:.*CUDA out of memory", "CUDA_OUT_OF_MEMORY"),
        (r"(?m)^\s*RuntimeError:.*CUDA out of memory", "CUDA_OUT_OF_MEMORY"),
        (r"(?m)^\s*ModuleNotFoundError:", "TRAINING_DEPENDENCY_MISSING"),
    ]
    matches = [(m.start(), code or m.group(1)) for pattern, code in patterns for m in re.finditer(pattern, clean)]
    return max(matches)[1] if matches else None


def session_log_text(text):
    try:
        payload = json.loads(text)
    except (ValueError, TypeError):
        return text, "TEXT" if text.strip() else "EMPTY"
    if isinstance(payload, list):
        return "\n".join(row["data"] for row in payload
                          if isinstance(row, dict) and isinstance(row.get("data"), str)), "JSON_EVENTS"
    if isinstance(payload, dict) and isinstance(payload.get("log"), str):
        return payload["log"], "JSON_LOG"
    return "", "JSON_UNRECOGNIZED"


def read_session_error(kernel, run=subprocess.run):
    try:
        result = run([sys.executable, "-m", "kaggle", "kernels", "logs", kernel],
                     capture_output=True, text=True, timeout=45, check=False)
        if result.returncode == 0:
            text, log_format = session_log_text(result.stdout)
            code = classify_session_error(text)
            return {"session_error_code": code, "session_log_format": log_format,
                    "session_diagnostics_status": "CLASSIFIED" if code else "UNCLASSIFIED"}
    except Exception:
        pass
    return {"session_error_code": None, "session_log_format": "UNAVAILABLE", "session_diagnostics_status": "UNAVAILABLE"}


def collect_status(kernel, run=subprocess.run):
    try:
        result = run(
            [sys.executable, "-m", "kaggle", "kernels", "status", kernel],
            capture_output=True, text=True, timeout=45, check=False,
        )
    except subprocess.TimeoutExpired:
        return evidence(code="KAGGLE_STATUS_TIMEOUT")
    except Exception:
        return evidence(code="KAGGLE_STATUS_QUERY_FAILED")
    if result.returncode != 0:
        return evidence(code="KAGGLE_STATUS_QUERY_FAILED")
    status_line, _, failure_message = result.stdout.strip().partition("\n")
    if failure_message and not failure_message.startswith("Failure message: "):
        return evidence(code="KAGGLE_STATUS_UNRECOGNIZED")
    match = re.fullmatch(
        re.escape(kernel) + r'\s+has status\s+[\"\']?(?:KernelWorkerStatus\.)?'
        r'(complete|running|queued|error|cancelled|canceled)[\"\']?',
        status_line, re.IGNORECASE,
    )
    if not match:
        return evidence(code="KAGGLE_STATUS_UNRECOGNIZED")
    state = match.group(1).upper().replace("CANCELED", "CANCELLED")
    proof = evidence(state)
    if state == "ERROR" and failure_message:
        text = failure_message.removeprefix("Failure message: ").strip('"')
        code = classify_session_error(text)
        proof.update(session_error_code=code, session_diagnostics_status="CLASSIFIED" if code else "UNCLASSIFIED")
    return proof


def main():
    token = os.environ.get("KAGGLE_API_TOKEN", "")
    if not token:
        proof = evidence(code="KAGGLE_API_TOKEN_MISSING")
    else:
        try:
            # Third-party introspection diagnostics are not evidence and must
            # not print account credentials or private provider responses.
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                from kagglesdk.kaggle_client import KaggleClient
                from kagglesdk.kaggle_creds import KaggleCredentials
                client = KaggleClient(user_agent="meliturgos-readonly-status/1.0")
                owner = KaggleCredentials(client=client, access_token=token).introspect()
            if not isinstance(owner, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", owner):
                raise ValueError("account unavailable")
            kernel = owner + "/" + SLUG
            proof = collect_status(kernel)
            if proof["session_status"] == "ERROR" and not proof["session_error_code"]:
                # Query the existing session log privately. Do not download
                # notebook output files or publish any raw provider text.
                proof.update(read_session_error(kernel))
        except Exception:
            proof = evidence(code="KAGGLE_ACCOUNT_LOOKUP_FAILED")
    text = json.dumps(proof, sort_keys=True)
    Path("kaggle-lora-status.json").write_text(text + "\n", encoding="utf-8")
    print(text)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        # Fixed-value annotation is readable through GitHub's API even when
        # signed artifact downloads are unavailable to a cloud workspace.
        print("::notice title=MEL Kaggle read-only status::session_status="
              + proof["session_status"] + ";weights_verified=false;promotion_allowed=false;code="
              + (proof["error_code"] or "NONE")
              + ";session_error_code=" + (proof["session_error_code"] or "UNCLASSIFIED")
              + ";diagnostics=" + proof["session_diagnostics_status"]
              + ";log_format=" + proof.get("session_log_format", "NOT_REQUESTED"))
    return 0 if proof["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
