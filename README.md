# Discord Bot Panel — Instalacja

Rozszerzenie do Chrome, Edge i Brave, które umożliwia korzystanie z Discorda z perspektywy własnego bota. Pozwala przeglądać wiadomości, wysyłać je jako bot oraz zarządzać serwerami i użytkownikami.

## 📋 Wymagania

- Windows 10/11
- Google Chrome, Microsoft Edge lub Brave
- Node.js 18 lub nowszy (do ręcznego uruchamiania pomocnika)
- Własny bot Discord i jego token

W [Discord Developer Portal](https://discord.com/developers/applications), w zakładce **Bot**, włącz:
- Message Content Intent
- Server Members Intent
- Presence Intent

## 📦 Instalacja

1. Pobierz projekt przez **Code → Download ZIP** i wypakuj.
2. Otwórz `chrome://extensions` lub `edge://extensions`.
3. Włącz **Tryb dewelopera**.
4. Kliknij **Załaduj rozpakowane** i wybierz folder z plikiem `manifest.json`.
5. Skopiuj ID zainstalowanego rozszerzenia.
6. Uruchom `INSTALUJ-AUTOSTART.bat` i podaj ID rozszerzenia.
7. Otwórz Discord Bot Panel i zaloguj się tokenem swojego bota.

## ⚙️ Do czego służy pomocnik?

Pomocnik to niewielki program działający lokalnie na komputerze, który pośredniczy w komunikacji rozszerzenia z Discord API.

**Rozszerzenie → Lokalny pomocnik → Discord API**

- `INSTALUJ-AUTOSTART.bat` — konfiguruje automatyczne uruchamianie i zamykanie pomocnika wraz z panelem.
- `START-PANEL.bat` — pozwala uruchomić pomocnika ręcznie.
- `USUN-AUTOSTART.bat` — usuwa konfigurację autostartu.

Pomocnik działa pod adresem `127.0.0.1:17643`, czyli **wyłącznie na komputerze użytkownika**. Każda osoba instalująca rozszerzenie korzysta ze swojego komputera.

## 🔒 Bezpieczeństwo

Nigdy nie udostępniaj tokenu bota ani nie publikuj go na GitHubie. Korzystaj wyłącznie z tokenów botów, a nie zwykłych kont Discorda.

Projekt jest nieoficjalny i nie jest powiązany z Discordem.
