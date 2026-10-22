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
        # A session's completion is not proof that training ran or weights exist.
        "gpu_execution_verified": False,
        "weights_verified": False,
        "promotion_allowed": False,
        "error_code": code,
        "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


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
    match = re.fullmatch(
        re.escape(kernel) + r'\s+has status\s+[\"\']?(?:KernelWorkerStatus\.)?'
        r'(complete|running|queued|error|cancelled|canceled)[\"\']?',
        result.stdout.strip(), re.IGNORECASE,
    )
    if not match:
        return evidence(code="KAGGLE_STATUS_UNRECOGNIZED")
    state = match.group(1).upper().replace("CANCELED", "CANCELLED")
    return evidence(state)


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
            proof = collect_status(owner + "/" + SLUG)
        except Exception:
            proof = evidence(code="KAGGLE_ACCOUNT_LOOKUP_FAILED")
    text = json.dumps(proof, sort_keys=True)
    Path("kaggle-lora-status.json").write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0 if proof["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
