# Private media compatibility

Reuse the existing private post-media bucket. Do not create aasiflow-media or new upload reservation tables/RPCs. The existing bucket allows images, video and audio up to 10 MiB per file. Existing Storage policies enforce owner folders, active sessions and serialized object limits (20/user, 80/project).

Uploads use normalized MIME, client container-signature checks, opaque owner paths and upsert:false. The generator rechecks downloaded file size, MIME and signature server-side. Image/video/audio attachments and optional voice-note recording are supported; preview URLs expire after five minutes. Never log URLs, attachment contents or provider keys. Signature checks are not full decoding, malware scanning or quarantine.

The existing bucket has no client DELETE policy, so deletion is unavailable. Removing an attachment only detaches its metadata from the edited post; it does not delete stored files. Storage limits can therefore require owner-authorized maintenance. Do not add a service-key bypass or run retention without approval.

No files were uploaded to or deleted from live Storage. No bucket, policy or retention configuration was changed. The alternative upload function/migrations are archived outside active deployment directories. The source work branch's proposed quarantine/retention implementation remains a separate reviewed milestone.
