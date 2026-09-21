# MEL-MEM-05 validation checkpoint

Candidate: attachment byte backfill
Validation branch: `candidate/mel-mem05-attachment-bytes-20260921`
Draft PR: #91

Validated scope:
- Collector 0.6.4 historical attachment backfill
- transient ChatGPT attachment download URL capture with HTTPS/host allowlist
- signed download URL stripped before persistence
- bounded authenticated byte fetch (25 MB/file)
- private upload to MEDIA_BUCKET / R2
- deterministic retry key for ChatGPT attachments
- SHA-256 integrity metadata
- conversation/message/attachment provenance
- bounded text extraction for supported textual files
- extracted content retained in archive attachment descriptors
- first-import and duplicate-enrichment indexing metadata
- indexed_descriptors / binary_content_complete coverage reporting
- failed byte backfills remain retryable instead of being falsely completed
- no duplicate attachment fetch in sendConversation
- RAG retrieval by a token present only inside extracted attachment content

Evidence:
- `5b0b49023e78dda12903e88efc943396d797c0b2`: collector + importer + private upload gate PASS.
- `a94e0ff47f0c2a26c7bcb5adb9b7aa2c81964458`: extended gate including attachment-content RAG retrieval PASS.
- GitHub Actions run `35599950879`: PASS.
- GitHub Actions run `35600020720`: PASS, including packaging Collector 0.6.4.

Not yet verified / not DONE:
- production historical backfill across the real ChatGPT corpus
- recovery of bytes for attachments whose original download URL is no longer available
- real binary extraction for PDF/image/audio/video and other non-text formats
- production R2/D1 end-to-end observation on representative old attachments
- MEL-MEM-06 unified operational memory bridge remains a separate roadmap item

This checkpoint is fail-closed: MEL-MEM-05 remains IN_PROGRESS until the real historical backfill and remaining binary parsers are validated.
