from app.routes.users import setup_users_routes
from app.routes.organizers import setup_organizers_routes
from app.routes.locations import setup_locations_routes
from app.routes.logs import setup_logs_routes
from app.routes.vks import setup_vks_routes
from app.routes.participants import setup_participants_routes

__all__ = [
    'setup_users_routes',
    'setup_organizers_routes',
    'setup_locations_routes',
    'setup_logs_routes',
    'setup_vks_routes',
    'setup_participants_routes',
]
