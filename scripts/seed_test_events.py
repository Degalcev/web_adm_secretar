#!/usr/bin/env python3
"""Заполнение test_db тестовыми событиями на текущую неделю (15 событий/день, пересекающиеся)."""
import uuid
import random
from datetime import timedelta, time, date

import asyncio
import sys
sys.path.insert(0, '/opt/web_test')

from sqlalchemy import select, delete
from database.models import async_session, Location, Organizer, Event, Document, EventHistory

VKS_TYPES = [
    'Совещание', 'Ставка', 'Селектор', 'Нарада', 'Брифинг',
    'Презентация', 'Координация', 'Обзор', 'Доклад', 'Встреча',
    'Заседание', 'Отчёт', 'Согласование', 'Планёрка', 'Интервью'
]

async def seed():
    async with async_session() as session:
        # Сначала собираем IDs (до удалений)
        locs = [(r.id, r.name) for r in (await session.scalars(select(Location)))]
        orgs = [(r.id, r.short_name or r.name) for r in (await session.scalars(select(Organizer)))]

        if not locs:
            print('Нет локаций! Создайте хотя бы одну локацию.'); return
        if not orgs:
            print('Нет организаторов! Создайте хотя бы одного.'); return

        print(f'Локаций: {len(locs)}, Организаторов: {len(orgs)}')

        today = date.today()
        monday = today - timedelta(days=today.weekday())

        # Удаляем старые данные этой недели
        for day_offset in range(7):
            d = monday + timedelta(days=day_offset)
            rows = list(await session.scalars(select(Event.id).where(Event.date == d)))
            if rows:
                await session.execute(delete(Document).where(Document.event_id.in_(rows)))
                await session.execute(delete(EventHistory).where(EventHistory.event_id.in_(rows)))
                await session.execute(delete(Event).where(Event.id.in_(rows)))
        await session.commit()
        print('Старые события удалены.')

        # Генерируем 15 событий на каждый день
        random.seed(42)

        for day_offset in range(7):
            d = monday + timedelta(days=day_offset)
            day_name = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][day_offset]
            count = 0

            time_slots = []

            # Группа 1: утренние (9:00-11:00), 4 события пересекаются
            base = random.choice([9, 9, 9, 10])
            for i in range(4):
                start_min = base * 60 + random.randint(-15, 15)
                start_min = max(9 * 60, min(start_min, 10 * 60))
                dur = random.choice([60, 90, 120, 45])
                time_slots.append((start_min, dur))

            # Группа 2: дневные (11:00-14:00), 4 события пересекаются
            base = random.choice([11, 12, 13])
            for i in range(4):
                start_min = base * 60 + random.randint(-20, 20)
                start_min = max(11 * 60, min(start_min, 13 * 60))
                dur = random.choice([60, 90, 120])
                time_slots.append((start_min, dur))

            # Группа 3: afternoon (14:00-16:00), 4 события пересекаются
            base = random.choice([14, 15])
            for i in range(4):
                start_min = base * 60 + random.randint(-15, 30)
                start_min = max(14 * 60, min(start_min, 15 * 60 + 30))
                dur = random.choice([60, 90, 120, 45])
                time_slots.append((start_min, dur))

            # Группа 4: вечерние (16:00-18:00), 3 события пересекаются
            base = random.choice([16, 17])
            for i in range(3):
                start_min = base * 60 + random.randint(-10, 20)
                start_min = max(16 * 60, min(start_min, 17 * 60 + 30))
                dur = random.choice([60, 90, 45])
                time_slots.append((start_min, dur))

            random.shuffle(time_slots)
            time_slots = time_slots[:15]

            for start_min, dur in time_slots:
                h = start_min // 60
                m = start_min % 60

                loc_id, loc_name = random.choice(locs)
                org_id, org_name = random.choice(orgs)
                vks_type = random.choice(VKS_TYPES)
                completed = random.random() < 0.3

                event = Event(
                    id=str(uuid.uuid4()),
                    type=vks_type,
                    date=d,
                    time=time(h, m),
                    organizer_id=org_id,
                    location_id=loc_id,
                    description=f'{vks_type} — {day_name} {d.strftime("%d.%m")} ({org_name})',
                    completed=completed,
                    notification=True,
                )
                session.add(event)
                count += 1

            await session.commit()
            print(f'  {day_name} {d.strftime("%d.%m.%Y")}: {count} событий')

        print('\nГотово! 105 событий создано.')

asyncio.run(seed())
