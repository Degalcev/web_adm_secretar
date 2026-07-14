"""Конфиг типов мероприятий."""

ALLOWED_TYPES = {
    'ВКС':        {'label': 'ВКС',         'color': 'var(--accent)',  'css_class': 'type-vks'},
    'Совещание':  {'label': 'Совещание',   'color': 'var(--success)', 'css_class': 'type-meeting'},
    'Встреча':    {'label': 'Встреча',     'color': 'var(--warning)', 'css_class': 'type-session'},
    'Заседание':  {'label': 'Заседание',   'color': 'var(--danger)',  'css_class': 'type-board'},
    'Приём':      {'label': 'Личный приём', 'color': 'var(--fg-muted)', 'css_class': 'type-reception'},
}

DEFAULT_TYPE = 'ВКС'


def validate_event_type(type_name: str) -> bool:
    return type_name in ALLOWED_TYPES


def get_type_info(type_name: str) -> dict:
    return ALLOWED_TYPES.get(type_name, ALLOWED_TYPES[DEFAULT_TYPE])
