from aiohttp import web
from loguru import logger
import os

from app.auth import admin_required


@admin_required
async def download_document(request: web.Request) -> web.Response:
    try:
        doc_id = request.match_info['id']
        from database.requests import get_document_by_id
        doc = await get_document_by_id(doc_id)
        if not doc:
            return web.json_response({'error': 'Документ не найден'}, status=404)

        # Если есть file_path — отдаём файл
        if doc.get('file_path') and os.path.exists(doc['file_path']):
            return web.FileResponse(
                doc['file_path'],
                filename=doc.get('name', 'document'),
                headers={'Content-Disposition': f'attachment; filename="{doc.get("name", "document")}"'}
            )

        # Если есть content (байты) — отдаём как файл
        if doc.get('content'):
            return web.Response(
                body=doc['content'],
                content_type='application/octet-stream',
                headers={'Content-Disposition': f'attachment; filename="{doc.get("name", "document")}"'}
            )

        return web.json_response({'error': 'Файл недоступен'}, status=404)
    except Exception as e:
        logger.error('Ошибка скачивания документа: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)


def setup_document_routes(app: web.Application):
    app.router.add_get('/admin/api/documents/{id}/download', download_document)
