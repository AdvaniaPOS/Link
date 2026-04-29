"""File uploads (images, video, PDF) for catalog/product/accessory media.

Files are stored under ``UPLOADS_DIR`` and served by the ``/uploads`` static
mount in :mod:`app.main`. Super-admin uploads land in ``global/`` and firm
uploads in ``firm/<firm_id>/`` so deletion of a firm removes its assets.
"""

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import get_current_user
from app.config import get_settings
from app.models import User, UserRole

router = APIRouter(prefix="/admin/uploads", tags=["admin:uploads"])

IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}
VIDEO_TYPES = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}
DOCUMENT_TYPES = {
    "application/pdf": ".pdf",
}
ALLOWED_TYPES = {**IMAGE_TYPES, **VIDEO_TYPES, **DOCUMENT_TYPES}

# Generous cap; videos are typically the largest assets.
MAX_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Filtype ikke støttet: {file.content_type}",
        )

    if user.role == UserRole.super_admin:
        subdir = "global"
    elif user.firm_id is not None:
        subdir = f"firm/{user.firm_id.hex}"
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brukeren er ikke knyttet til et firma.",
        )

    contents = await file.read(MAX_BYTES + 1)
    if len(contents) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Filen er for stor (maks {MAX_BYTES // (1024 * 1024)} MB).",
        )

    settings = get_settings()
    ext = ALLOWED_TYPES[file.content_type]
    name = f"{uuid4().hex}{ext}"
    target_dir = Path(settings.uploads_dir) / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / name
    target.write_bytes(contents)

    return {
        "url": f"/uploads/{subdir}/{name}",
        "filename": file.filename or name,
        "content_type": file.content_type,
        "size": str(len(contents)),
    }
