#!/usr/bin/env python3
"""Миграция документов из БД на файловую систему.

Использование:
    python migrate_docs.py --dry-run   — Показать что будет сделано
    python migrate_docs.py --apply     — Выполнить миграцию
    python migrate_docs.py --cleanup   — Удалить content из БД после миграции
"""

import os
import sys
import uuid

# Добавляем корень проекта в путь
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update, text
from database.models import async_session, Document, engine
from config import DOCUMENTS_DIR


async def migrate_documents(dry_run=True, cleanup=False):
    async with async_session() as session:
        result = await session.execute(
            select(Document).where(Document.content.isnot(None))
        )
        docs = list(result.scalars().all())

        if not docs:
            print('Нет документов для миграции.')
            return

        print(f'Найдено {len(docs)} документов для миграции.\n')

        migrated = 0
        skipped = 0
        errors = 0

        for doc in docs:
            if not doc.event_id:
                print(f'  SKIP {doc.name} — нет event_id')
                skipped += 1
                continue

            safe_name = f'{doc.id}_{doc.name}'
            doc_dir = os.path.join(DOCUMENTS_DIR, doc.event_id)
            file_path = os.path.join(doc_dir, safe_name)

            if dry_run:
                print(f'  DRY-RUN: {doc.name} → {file_path}')
                migrated += 1
                continue

            try:
                os.makedirs(doc_dir, exist_ok=True)
                with open(file_path, 'wb') as f:
                    f.write(doc.content)

                await session.execute(
                    update(Document)
                    .where(Document.id == doc.id)
                    .values(file_path=file_path, content=None if cleanup else Document.content)
                )

                print(f'  OK: {doc.name} → {file_path}')
                migrated += 1
            except Exception as e:
                print(f'  ERROR: {doc.name} — {e}')
                errors += 1

        if not dry_run:
            if cleanup:
                await session.execute(
                    text("UPDATE documents SET content = NULL WHERE content IS NOT NULL")
                )
                print('\nContent очищен в БД.')
            await session.commit()

        print(f'\nИтого: {migrated} мигрировано, {skipped} пропущено, {errors} ошибок')
        print(f'Директория: {DOCUMENTS_DIR}')


if __name__ == '__main__':
    args = sys.argv[1:]

    if '--apply' in args:
        import asyncio
        asyncio.run(migrate_documents(dry_run=False, cleanup='--cleanup' in args))
    elif '--cleanup' in args:
        import asyncio
        asyncio.run(migrate_documents(dry_run=False, cleanup=True))
    else:
        import asyncio
        asyncio.run(migrate_documents(dry_run=True))
