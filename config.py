"""Основные настройки бота."""
from pathlib import Path

BOT_TOKEN = "YOUR_TOKEN"  # замените на токен BotFather или задайте через переменную окружения BOT_TOKEN
DATABASE_PATH = Path("database") / "bot.sqlite3"

# Настройки анти-спама
SPAM_KEYWORDS = ["buy", "free", "promo", "http://", "https://", "тут ссылка"]
SPAM_NOTIFICATION = "Сообщение удалено как спам. Пожалуйста, соблюдайте правила чата."

# Настройки анти-флуда
FLOOD_COOLDOWN_SECONDS = 3
FLOOD_WARNING = "Слишком много сообщений подряд. Подождите несколько секунд."

# Настройки голосования за мут
MUTE_VOTE_THRESHOLD = 3  # сколько голосов нужно для мьюта
MUTE_DURATION_SECONDS = 60 * 5  # длительность мьюта в секундах

# Настройки игры
XP_PER_MESSAGE = 5
XP_PER_LEVEL = 50

# Платные модули (по умолчанию выключены)
PAID_MODULES = {
    "advanced_admin": False,
    "priority_support": False,
}
