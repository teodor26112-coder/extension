"""Вспомогательные функции для модулей."""
from __future__ import annotations

from telegram import Update
from telegram.constants import ChatMemberStatus


async def is_chat_admin(update: Update) -> bool:
    """Проверить, является ли пользователь администратором в чате."""
    chat = update.effective_chat
    user = update.effective_user
    if not chat or not user:
        return False

    member = await chat.get_member(user.id)
    return member.status in {ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER}
