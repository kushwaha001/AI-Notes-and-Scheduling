import hashlib

async def upload_document(file):

    content = await file.read()

    file_hash = hashlib.sha256(content).hexdigest()

    return {
        "status":"uploaded",
        "hash":file_hash
    }