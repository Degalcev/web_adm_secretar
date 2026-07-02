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
            logger.warning('Документ не найден: {}', doc_id)
            return web.json_response({'error': 'Документ не найден'}, status=404)

        logger.debug('Скачивание документа: {} ({})', doc.get('name'), doc_id)

        file_path = doc.get('file_path')
        if file_path and os.path.exists(file_path):
            return web.FileResponse(
                path=file_path,
                headers={'Content-Disposition': f'attachment; filename="{doc.get("name", "document")}"'}
            )

        logger.warning('Файл недоступен: {} ({})', doc.get('name'), doc_id)
        return web.json_response({'error': 'Файл недоступен'}, status=404)
    except Exception as e:
        logger.error('Ошибка скачивания документа {}: {}', doc_id, repr(e))
        return web.json_response({'error': str(e)}, status=500)


@admin_required
@require_csrf
async def upload_document(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        field = await reader.next()
        if not field or field.name != 'file':
            logger.warning('Загрузка документа: файл не найден в запросе')
            return web.json_response({'error': 'Файл не найден'}, status=400)

        filename = field.filename
        content = await field.read()
        event_id = request.match_info.get('event_id')
        logger.info('Загрузка документа {} в событие {} ({} байт)', filename, event_id, len(content))

        from database.sending import add_document
        doc_id = await add_document(
            event_id=event_id,
            name=filename,
            size=len(content),
            content=content
        )
        logger.info('Документ загружен: {} (id={})', filename, doc_id)
        return web.json_response({'ok': True, 'id': doc_id, 'name': filename, 'size': len(content)})
    except Exception as e:
        logger.error('Ошибка загрузки документа: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def delete_document(request: web.Request) -> web.Response:
    try:
        doc_id = request.match_info['id']
        logger.info('Удаление документа: {}', doc_id)
        from database.sending import delete_document as del_doc
        await del_doc(doc_id)
        logger.info('Документ удалён: {}', doc_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления документа {}: {}', doc_id, repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


def setup_document_routes(app: web.Application):
    app.router.add_get('/admin/api/documents/{id}/download', download_document)
    app.router.add_post('/admin/api/events/{event_id}/documents', upload_document)
    app.router.add_delete('/admin/api/documents/{id}', delete_document)
