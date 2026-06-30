from aiohttp import web
from loguru import logger
import os

from app.auth import admin_required, require_csrf


@admin_required
async def download_document(request: web.Request) -> web.Response:
    try:
        doc_id = request.match_info['id']
        from database.requests import get_document_by_id
        doc = await get_document_by_id(doc_id)
        if not doc:
            return web.json_response({'error': 'Документ не найден'}, status=404)

        if doc.get('file_path') and os.path.exists(doc['file_path']):
            return web.FileResponse(
                doc['file_path'],
                filename=doc.get('name', 'document'),
                headers={'Content-Disposition': f'attachment; filename="{doc.get("name", "document")}"'}
            )

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


@admin_required
@require_csrf
async def upload_document(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        field = await reader.next()
        if not field or field.name != 'file':
            return web.json_response({'error': 'Файл не найден'}, status=400)

        filename = field.filename
        content = await field.read()
        event_id = request.match_info.get('event_id')

        from database.sending import add_document
        doc_id = await add_document(
            event_id=event_id,
            name=filename,
            size=len(content),
            content=content
        )
        return web.json_response({'ok': True, 'id': doc_id, 'name': filename, 'size': len(content)})
    except Exception as e:
        logger.error('Ошибка загрузки документа: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def delete_document(request: web.Request) -> web.Response:
    try:
        doc_id = request.match_info['id']
        from database.sending import delete_document as del_doc
        await del_doc(doc_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления документа: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


def setup_document_routes(app: web.Application):
    app.router.add_get('/admin/api/documents/{id}/download', download_document)
    app.router.add_post('/admin/api/events/{event_id}/documents', upload_document)
    app.router.add_delete('/admin/api/documents/{id}', delete_document)
