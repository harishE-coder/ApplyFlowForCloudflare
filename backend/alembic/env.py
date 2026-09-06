"""
Alembic environment configuration for async SQLAlchemy.
"""

import asyncio
import os
import sys
from logging.config import fileConfig

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import context
from app.core.config import settings

# Import Base and all models so metadata is populated
from app.core.database import Base
from app.modules.activity_logs.models import ActivityLog  # noqa: F401
from app.modules.applications.models import Application, ApplicationEvent  # noqa: F401
from app.modules.attendance.models import Attendance  # noqa: F401
from app.modules.chat.models import (  # noqa: F401
    ChatMessage,
    ChatRead,
    ChatRoom,
    PushSubscription,
)
from app.modules.clients.models import Client, EmployeeClient  # noqa: F401
from app.modules.interview_intelligence.models import (  # noqa: F401
    EmailTrainingData,
    InterviewEvent,
)
from app.modules.notifications.models import (  # noqa: F401
    Notification,
    NotificationPreference,
)
from app.modules.requirements.models import Requirement  # noqa: F401
from app.modules.resumes.models import Resume  # noqa: F401
from app.modules.targets.models import Target  # noqa: F401

# Import all models to register them with Base.metadata
from app.modules.users.models import SubAdminAssignment, User  # noqa: F401
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

# Alembic Config object
config = context.config

# Override sqlalchemy.url with our settings
config.set_main_option("sqlalchemy.url", settings.database_url)

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    """Run migrations in 'online' async mode."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
