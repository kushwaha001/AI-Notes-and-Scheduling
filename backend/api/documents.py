from fastapi import APIRouter, UploadFile
from services.document_service import upload_document

router = APIRouter(prefix="/documents")

@router.post("/upload")
async def upload(file: UploadFile):
    return await upload_document(file)