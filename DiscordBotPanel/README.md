# Discord Bot Panel v1.12.1 — poprawki

Ta wersja bazuje na 1.12 i zachowuje istniejące funkcje. Zmiany:

- Jeden kompaktowy profil użytkownika niezależnie od miejsca otwarcia: czat, wzmianki, boczna lista członków oraz widok członków w ustawieniach.
- Poprawione położenie profilu na ekranie: żaden z czterech przycisków (Zarządzaj, Moderuj, Historia, DM) nie powinien być ucinany; zbędny przycisk Zamknij usunięty.
- Widoczne kolorowe etykiety wszystkich dostępnych ról danego użytkownika. Kwadratowy + otwiera przewijaną listę ról z wyszukiwarką i polami wyboru. Rangi można zaznaczać i odznaczać bez opuszczania profilu.
- Zmiany ról i nicku w małym profilu czekają na przycisk **Zapisz zmiany**; **Anuluj** przywraca pierwotny stan. Role, którymi bot nie może zarządzać, są zablokowane. Operacje wymagają odpowiednich uprawnień i hierarchii Discorda.
- Ulepszone wyświetlanie kolorów ról w ustawieniach, także przy zwracanym przez Discord `colors.primary_color`.
- Szczegóły zbanowanych użytkowników: kliknięcie poza oknem, Esc lub ponowne kliknięcie tej samej osoby zamyka okienko. Potwierdzenie odbanowania jest niezależne.

## Instalacja

Zamknij kartę panelu, wypakuj to archiwum i zastąp pliki dotychczasowego folderu DiscordBotPanel. Wejdź na `chrome://extensions`, kliknij **Odśwież**, następnie otwórz panel. W tej poprawce **nie zmienia się lokalny pomocnik Windows** — nie trzeba ponownie instalować autostartu, jeżeli ID rozszerzenia i jego ścieżka pozostały takie same.

## Testowanie

Sprawdzono składnię plików, dostępne operacje pomocnika oraz działanie panelu na symulowanych odpowiedziach Discord API. Testy w Chromium obejmowały wyświetlenie ról, zaznaczanie/odznaczanie kilku pozycji, zapis i anulowanie, ograniczenia hierarchii, widoczność wszystkich przycisków i zamykanie popupu banów. Nie testowano zmian z prawdziwym tokenem Discorda.

---

# Discord Bot Panel 1.12

Rozszerzenie Chrome / Edge / Brave (Manifest V3) pozwalające obsługiwać własnego bota Discord z pełnej karty przeglądarki. Nie służy do logowania kontem zwykłego użytkownika ani obchodzenia uprawnień bota.

## Instalacja i aktualizacja

1. **Rozpakuj folder `DiscordBotPanel`** do stałego miejsca na komputerze.
2. Zamknij stare okna `START-PANEL.bat`, jeśli pozostały otwarte.
3. Otwórz `chrome://extensions`, włącz **Tryb dewelopera** i wybierz **Załaduj rozpakowane** (lub odśwież już zainstalowane rozszerzenie). Wskaż folder z `manifest.json`.
4. Jeżeli autostart z wersji 1.6/1.7 był poprawnie zainstalowany **i ścieżka folderu się nie zmieniła**, nie musisz ponownie instalować autostartu. Jeżeli przeniosłeś folder albo zmieniło się ID rozszerzenia, uruchom `INSTALUJ-AUTOSTART.bat`, wklej ID z `chrome://extensions` i postępuj zgodnie z instrukcjami.
5. Otwórz rozszerzenie z jego ikony i wpisz **token własnego bota**. Token nie należy do zwykłego konta Discord.
6. Awaryjnie możesz uruchomić `START-PANEL.bat`. Node.js 18+ musi być zainstalowany i dostępny w PATH. Pomocnik działa tylko na `127.0.0.1`.

> **Ważne:** wersja 1.12 wymaga nowego `helper/server.js` i `helper/BotPanelHost.exe`. Zamknij wszystkie karty starego panelu i ewentualny `START-PANEL.bat` przed podmianą. Jeśli folder i ID rozszerzenia się nie zmieniły, autostart powinien działać bez ponownej rejestracji.

## Nowości w wersji 1.12

- **Statusy członków**: kolorowe kropki nachodzące na awatar, aktywność / niestandardowy status pod nickiem, aktywni pogrupowani według ról, wszyscy znani offline na dole. Wymaga **Guild Presences Intent**. Przy logowaniu przełącznik jest domyślnie włączony; jeśli Discord zwróci odmowę, panel automatycznie ponowi połączenie bez tego intentu, nie oznaczając nieznanych statusów jako offline.
- **Wyszukiwarka**: klasyczna paginacja 25 wyników na stronę z numerami stron, poprzednią/następną, bez przycisku „Pokaż kolejne wyniki”. Filtry i powrót do nich zachowane. Limit API wyszukiwania: offset maksymalnie 9975.
- **Kanały**: ciaśniejsze zwinięte kategorie, w ustawieniach serwera widok hierarchiczny odpowiadający układowi kanałów, przeciąganie kanałów i kategorii, zapisywanie i anulowanie układu.
- **Role**: przenoszenie przez przeciąganie w ustawieniach, kompaktowa lista z kolorowym kółkiem i obramowaniem roli, kwadratowy wybór koloru oraz edytowalne pole HEX, bardziej przejrzyste przełączniki. Edycje i kolejność są lokalnym szkicem do czasu **Zapisz zmiany**; **Anuluj** odrzuca szkic. Pozycje ogranicza hierarchia bota.
- **Profile**: mniejsze podręczne okienko w pobliżu klikniętej osoby, z dostępnym zarządzaniem użytkownikiem. Zakładka członków w ustawieniach pokazuje zwartą siatkę ikon z nickiem pod awatarem. Analogiczny widok dla banów, który umożliwia zobaczenie powodu i odbanowanie.
- **Dziennik audytu**: kompaktowe wpisy z ikonami, filtrami typu zdarzenia / wykonawcy, szczegółami po rozwinięciu i pobieraniem starszych wpisów. Discord udostępnia ograniczoną historię audytu.
- **Zaproszenia**: ikona obok nazwy kanału, tworzenie zaproszenia z czasem ważności i limitem użyć oraz kopiowanie linku.
- **Nawigacja ustawień**: stały nagłówek serwera bez przycinania, węższy pasek i subtelne przewijanie.
- **Nieprzeczytane wiadomości**: kanały domyślnie otwierają się na samym dole; niebieski pasek `#5865F2` pojawia się, jeśli są nowe wiadomości od ostatniego lokalnego odczytu. Kliknięcie, wysłanie wiadomości lub próba przewinięcia w dół oznaczają je jako przeczytane. Historia nadal doczytuje się do góry. Odczyty są lokalne i **nie synchronizują się z natywnym kontem Discord**.

**Uwaga przed zmianami na prawdziwym serwerze:** ustawianie kolejności ról i kanałów używa API Discorda, które nie oferuje atomowego zapisu całej wieloetapowej operacji. Przeniesienie kanałów między kategoriami odbywa się po jednym; jeśli Discord odrzuci późniejsze żądanie, wcześniejsze przesunięcia mogą już być wykonane. Sprawdź uprawnienia i podgląd kolejności przed zatwierdzeniem. Zachowano oddzielne potwierdzenia operacji moderacyjnych.

**Instalacja 1.12:** musisz podmienić również `helper/server.js` oraz `helper/BotPanelHost.exe`; zachowanie starego pomocnika 1.11 spowoduje błąd niezgodności. Jeśli używasz statusów osób, włącz **Presence Intent** w Discord Developer Portal → Bot → Privileged Gateway Intents. Do pełnej listy członków potrzebny jest również **Server Members Intent**.

## Nowe w wersji 1.11 — wiadomości, członkowie i ustawienia

- **Łączenie wiadomości**: następujące bezpośrednio po sobie wiadomości tego samego autora (do pięciu minut odstępu) wyświetlają awatar i nick tylko na początku grupy. Pojedyncze wiadomości nadal mają własne ID i przyciski. Wpisy z odpowiedziami nie są łączone.
- **Pasek działań**: ikony Odpowiedz, Reakcja, Usuń (gdy bot ma uprawnienia) i `…`. W menu `…`: edycja własnej wiadomości, skopiowanie linku, przypięcie/odpięcie zgodnie z aktualnym stanem, wątek, zaznaczanie i kopiowanie ID. Awatar i nick nadal otwierają profil; każda wiadomość podświetla się osobno.
- **Zwijanie kategorii**: kliknięcie nazwy kategorii pokazuje/ukrywa kanały, pamięta wybór osobno dla bota i serwera, wskazuje nieprzeczytane kanały, gdy kategoria jest zwinięta. Menu prawego przycisku pozostaje.
- **Ustawienia serwera i kanału**: nawigacja ma teraz około 218 px, jest bliżej lewej krawędzi, nazwy zakładek mają więcej miejsca. Treść jest szersza.
- **Uprawnienia kanałów**: przełącznik kanału prywatnego, synchronizacja z kategorią, trzy stany Odmów / Dziedzicz / Zezwól, lista ról i konkretnych osób. Wpisywanie nazwy roli lub użytkownika pokazuje sugestie (role lokalnie, użytkownicy również przez wyszukiwanie Discord API). Wiele zmian różnych ról/osób zapisuje się przyciskiem **Zapisz zmiany**; **Anuluj** odrzuca szkic. Uwaga: zapisywanie wielu nadpisań wymaga kilku kolejnych żądań; jeśli Discord odrzuci któreś, panel zgłosi błąd, a wcześniejsze zapisane operacje nie są automatycznie cofane.
- **Zapisz / Anuluj** także w przeglądzie i bezpieczeństwie serwera, edytorze roli, przeglądzie kanału i edycji członka. Ostrzeżenie przy opuszczeniu widoku z niezapisanymi zmianami.
- **Członkowie**: wejście w zakładkę automatycznie wczytuje pierwszą partię (do 1000), kolejne pojawiają się przy przewijaniu listy albo po kliknięciu przycisku. Wyszukiwanie, filtrowanie według roli, awatary i klikane profile. Pełne pobieranie wymaga `Server Members Intent`.
- **Zarządzanie członkiem**: zmiana nicku i zestawu możliwych do edycji ról, zapisywana dopiero po **Zapisz zmiany**. `Anuluj` odrzuca wszystkie zmiany tego formularza. Jednorazowe timeout/kick/ban w osobnym panelu z potwierdzeniami. W istniejącym profilu (otwieranym z wiadomości lub bocznej listy członków) jest przycisk przejścia do tego samego edytora.
- **Emoji i naklejki**: prawidłowe miniatury PNG/APNG, dodawanie plików, zmiana nazwy oraz usuwanie emoji/naklejek. Można też edytować opis i powiązane emoji naklejki. Wymaga uprawnień do zarządzania wyrażeniami serwera. **Animowane Lottie** nie mają jeszcze renderowania animacji w podglądzie — panel pokazuje informację o formacie zamiast fałszywej miniatury; wysyłanie ich w czacie pozostaje dostępne.

### Aktualizacja z 1.10

1. Zamknij kartę rozszerzenia. Zatrzymaj stary ręczny `START-PANEL.bat`, jeżeli jest uruchomiony.
2. Podmień **cały folder**, razem z `helper/server.js` oraz `helper/BotPanelHost.exe`.
3. Wejdź na `chrome://extensions` i wybierz Odśwież przy Discord Bot Panel.
4. Otwórz ponownie kartę z panelu. Jeżeli pojawi się błąd autostartu, uruchom `INSTALUJ-AUTOSTART.bat` z ID rozszerzenia. Node.js musi być w PATH.
5. Przy pełnej liście członków upewnij się, że `Server Members Intent` jest włączony w Discord Developer Portal.

Testy: `node tests/smoke.js`, `node tests/v1.11-routes.js`, test Chromium na danych symulowanych. Nie przeprowadzano prawdziwych operacji moderacji ani zapisów na serwerze Discord. Wersja nie jest kopią wszystkich funkcji oficjalnej aplikacji Discord; zakres zależy od botowego API i hierarchii uprawnień.

## Nowe w wersji 1.10 — wygodniejszy czat

- **Jeden przycisk wiadomości prywatnych**: usunięto fioletową gwiazdkę z lewego górnego rogu. Koperta PV jest teraz pierwszą ikoną nad serwerami i otwiera ten sam widok DM.
- **Lista członków domyślnie włączona**: po wybraniu serwera pojawia się automatycznie jako wąska kolumna pod wspólnym górnym paskiem. Ikona członków włącza/wyłącza widok i **pamięta wybór** w lokalnych ustawieniach przeglądarki przypisanych do bota. Jeśli nie masz uprawnień/Intents do pobierania członków, panel pokaże błąd bez zmyślania danych.
- **Wspólny pasek czatu**: nazwa kanału po lewej, ikony (wątki, przypięte, członkowie, wyszukiwarka) po prawej krawędzi. Lista członków znajduje się dopiero pod tym paskiem.
- **Wyszukiwarka**: w czasie wyszukiwania lista członków znika tymczasowo, a po zamknięciu wyszukiwarki wraca zgodnie z zapamiętanym ustawieniem. Po rozpoczęciu wyszukiwania filtry ustępują wynikom; przycisk **← Filtry** pozwala wrócić z zachowaniem wprowadzonych wartości.
- **Małe okienka**: wątki, przypięte, dodatkowe menu oraz wybieranie emoji/naklejek można zamknąć kliknięciem poza okienkiem, ponownym kliknięciem jego ikonki lub klawiszem **Esc**. Tak samo zamyka się podgląd profilu. Pełnoekranowe ustawienia i formularze z danymi nie zamykają się przez przypadkowe kliknięcie.
- **Pole wiadomości**: usunięto górny pasek formatowania (B/I/U/S/Kod/Spoiler/Plik/Zaznacz). **Plus** po lewej jest jedynym przyciskiem dodawania pliku; po prawej są **Emoji**, **Naklejki** i **Wyślij**. Zbiorcze zaznaczanie nadal jest w menu kontekstowym wiadomości. Formatowanie Markdown pozostaje dostępne poprzez wpisywanie składni Discorda.
- **Naklejki**: menu pobiera naklejki wybranego serwera przez oficjalne API. Kliknięcie naklejki wysyła ją jako osobną wiadomość bota (`sticker_ids`). Nie wysyła przy tym niedokończonego tekstu z pola wpisywania. Naklejki Lottie mogą być wysyłane, ale mają zastępczą miniaturę.

## Poprzednie zmiany wersji 1.9 — przebudowa interfejsu

- Kliknij **nazwę serwera** u góry kanałów: znajdziesz tam *Ustawienia serwera*, *Odśwież kanały i czat*, *Akcje masowe* i powiadomienia. Audyt pozostaje w sekcji ustawień serwera. Oddzielne przyciski ustawień, audytu i odświeżania z nagłówka czatu zostały ukryte.
- Lista członków jest wąską, wbudowaną kolumną po **prawej** (jeden przycisk 👥). Grupy bazują na rolach z opcją „Pokaż członków osobno”, w kolejności ról. Nie przedstawiamy nieznanego statusu online jako faktycznego.
- Przypięte wiadomości (📌) znajdują się obok przycisku listy członków.
- Jeden przycisk DM (✉) na górze paska serwerów; nową rozmowę tworzysz po przejściu do DM z lewego paska.
- Status połączenia **Na żywo** jest nad nazwą bota; czerwony przycisk **WYLOGUJ** jest bardziej widoczny i wymaga potwierdzenia.
- W ustawieniach serwera sekcje menu są pogrupowane; uprawnienia ról podzielone są tematycznie, a uprawnienia kanału mają trzy czytelne przyciski *Dziedzicz*, *Zezwól*, *Odmów* (zmiany nadal trzeba zapisać).
- Z moderacji masowej usunięto **filtr daty dołączenia**. Można celować w osoby bez dodatkowych ról lub wszystkie osoby, które bot może moderować, z zachowaniem osobnej listy chronionych oraz dwuetapowym potwierdzeniem.

## Funkcje zachowane z 1.8

- **Moderacja z profilu**: timeout (10 minut–28 dni), cofnięcie timeoutu, kick, ban z powodem i potwierdzeniem.
- **Jednorazowe akcje masowe** w zakładce *Ustawienia serwera → Akcje masowe*: timeout, kick lub ban. Domyślnie jedynie członkowie bez dodatkowych ról. Opcjonalnie wszyscy, których bot technicznie może moderować. Zawsze bez botów, właściciela, zaufanych ról/ID i osób co najmniej równych botowi w hierarchii. Pełna lista członków, podgląd liczby i części nazw, tekst potwierdzenia, dodatkowe potwierdzenie, kolejka, postęp, przycisk zatrzymania, zapis wyniku.
- **Historia moderacji** z panelu (lokalna, do 1000 wpisów na bota i serwer; nie zastępuje dziennika audytu Discorda).
- **Lista członków po prawej stronie** z wyszukiwaniem i przejściem do profilu. Statusy online nie są wyświetlane bez odpowiednich informacji Gateway.
- **Przebudowane ustawienia serwera i kanałów** — bardziej czytelne formularze i sekcje; dotychczasowe uprawnienia, role, kanały, bany, zaproszenia i audyt pozostają.
- **DM** w jednym przycisku u góry paska serwerów: po otwarciu DM przycisk `+` nowej rozmowy znajduje się w panelu kanałów.
- **Klikalne wzmianki**: `@osoba` → profil, `#kanał` → przejście do kanału (jeśli jest dostępny), `@rola` → podgląd roli.
- **Rozbudowane menu kontekstowe**: prawy przycisk na wiadomości, nicku/awatarze lub nazwie serwera; istniejące menu kanałów pozostaje.
- **Nieprzeczytane wiadomości**: lokalnie zapamiętywane znaczniki; nie synchronizują przeczytania ze zwykłym kontem Discord.
- **Edytor wiadomości**: formatowanie składnią Discorda, wybieranie emoji, wysyłanie naklejek, załączniki pod przyciskiem plus i lokalne szkice kanałów.
- **Wątki i forum**: przegląd aktywnych i do 50 publicznych archiwalnych wątków, zakładanie nowego wątku/postu i tworzenie wątku na podstawie wiadomości. Niektóre operacje zależą od rodzaju kanału i uprawnień.
- **Przypięte wiadomości**: lista i przejście do wiadomości, przypinanie i odpinanie, zgodnie z uprawnieniami Discorda.
- **Reakcje**: wybór emoji, emoji serwera, podgląd pierwszych 100 użytkowników po kliknięciu prawym przyciskiem na reakcji.
- **Zbiorcze zaznaczanie** aktualnie wczytanych wiadomości i usuwanie z potwierdzeniem (do 100 naraz w API; wiadomości starsze niż 14 dni pojedynczo).
- **Discord AutoMod**: lista reguł, włączanie/wyłączanie, edycja listy słów dla reguł słów kluczowych, tworzenie podstawowej reguły blokującej i usuwanie reguł. To **inny system** niż automod w kodzie bota na IceHost.
- **Powiadomienia w panelu** o wybranych zdarzeniach serwera, włączane przez menu nazwy serwera. Działają tylko podczas połączenia i tylko dla zdarzeń udostępnionych przez Gateway.

## Wymagane uprawnienia i intents

- Dla podstawowego czatu i naklejek: View Channel, Read Message History, Send Messages, możliwość używania naklejek na danym serwerze i (dla pełnej treści) **Message Content Intent** w Discord Developer Portal.
- Dla pełnej listy członków / masowych akcji: włącz **Server Members Intent (Guild Members Intent)** w Discord Developer Portal. Dla zweryfikowanych botów może być wymagana zgoda Discorda. Jeśli lista członków nie da się pobrać do końca, masowa akcja jest blokowana.
- Dla moderacji: Moderate Members, Kick Members, Ban Members (zależnie od czynności) oraz rola bota **wyżej** od użytkownika. Samo posiadanie uprawnienia Administrator **nie omija hierarchii ról**.
- Dla ustawień: Manage Guild, Manage Channels, Manage Roles; dla dziennika: View Audit Log.
- Dla przypinania: odpowiednie uprawnienie Pin Messages. Dla usuwania cudzych wiadomości: Manage Messages.
- Dla Discord AutoMod: Manage Guild.

## Ograniczenia i bezpieczeństwo

- Bot nie ma pełnego dostępu do funkcji zwykłego konta Discord, np. wszystkich osobistych DM, dokładnych stanów przeczytania konta, integracji użytkownika i wszystkich stron ustawień.
- Akcje masowe są **wyłącznie ręczne i jednorazowe**. Nie ma automatycznego banowania nowo dołączających członków ani działania po zamknięciu karty. Liczba pobieranych członków jest ograniczona do 30 000; na większych serwerach akcja zostanie zablokowana, jeśli nie pobrano wszystkich danych.
- Przed każdym masowym uruchomieniem konieczne jest ponowne pobranie listy i potwierdzenie. Przerwanie zatrzymuje **następne** żądania, nie cofa już wykonanych kar.
- Token bota nie jest przesyłany poza urządzenie inaczej niż do oficjalnego Discord API przez lokalny pomocnik, ale **jego przechowywanie w rozszerzeniu jest wrażliwe**. Nie udostępniaj tokenu ani folderu z konfiguracją.
- Niektóre operacje mogą być niedostępne przez API, zależeć od uprawnień albo limitów Discorda. Wersja ta jest przetestowana lokalnie na symulowanych odpowiedziach; użycie na prawdziwym serwerze wymaga dalszego sprawdzenia.

## Diagnostyka

- W DevTools (`F12` → Console) sprawdzisz błędy interfejsu. Pomocnik w trybie ręcznym pokazuje status w konsoli `START-PANEL.bat`.
- Jeżeli pojawi się informacja o innej wersji pomocnika, zamknij wszystkie karty i stare okno `START-PANEL.bat`, a następnie otwórz panel ponownie.
- Testy serwera API uruchomisz w folderze przez `node tests/smoke.js`. Te testy nie łączą się z Discordem.
- `USUN-AUTOSTART.bat` wyrejestrowuje natywnego pomocnika.
