export type FaqRole = "all" | "employer" | "employee";

export type FaqCategoryId =
  | "account-and-login"
  | "employees"
  | "jobs-and-stages"
  | "budgets-and-export"
  | "attendance"
  | "vacations"
  | "calendar"
  | "photos"
  | "notifications"
  | "pwa-install"
  | "billing"
  | "security"
  | "account-delete"
  | "technical";

export type FaqItem = {
  id: string;
  category: FaqCategoryId;
  categoryLabel: string;
  question: string;
  answer: string;
  keywords: string[];
  synonyms: string[];
  popularity: number;
  roles: FaqRole[];
  relatedLinks?: Array<{ label: string; href: string }>;
};

export const FAQ_CATEGORIES: Array<{ id: FaqCategoryId; label: string }> = [
  { id: "account-and-login", label: "Konto i logowanie" },
  { id: "employees", label: "Pracownicy" },
  { id: "jobs-and-stages", label: "Zlecenia i etapy" },
  { id: "budgets-and-export", label: "Kosztorysy i eksport" },
  { id: "attendance", label: "Obecność" },
  { id: "vacations", label: "Urlopy" },
  { id: "calendar", label: "Kalendarz" },
  { id: "photos", label: "Zdjęcia i galeria" },
  { id: "notifications", label: "Powiadomienia" },
  { id: "pwa-install", label: "Instalacja PWA" },
  { id: "billing", label: "Płatności i subskrypcja" },
  { id: "security", label: "Bezpieczeństwo i dane" },
  { id: "account-delete", label: "Usuwanie konta" },
  { id: "technical", label: "Problemy techniczne" },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "signup-account",
    category: "account-and-login",
    categoryLabel: "Konto i logowanie",
    question: "Jak założyć konto?",
    answer:
      "Aby utworzyć konto, przejdź na stronę logowania i wybierz opcję rejestracji. Wybierz rolę pracodawcy lub pracownika, podaj adres e-mail, hasło oraz dane podstawowe. Po rejestracji pracodawca przechodzi do aktywacji subskrypcji, a pracownik do ekranu oczekiwania na akceptację przez firmę.",
    keywords: ["rejestracja", "konto", "założyć", "utworzyć"],
    synonyms: ["zarejestrować się", "dodać konto"],
    popularity: 98,
    roles: ["all"],
  },
  {
    id: "login-employer",
    category: "account-and-login",
    categoryLabel: "Konto i logowanie",
    question: "Jak zalogować się jako pracodawca?",
    answer:
      "Pracodawca loguje się na stronie logowania, wpisując adres e-mail i hasło przypisane do konta. Po poprawnym logowaniu trafia do panelu firmy i może zarządzać zleceniami, pracownikami i subskrypcją.",
    keywords: ["logowanie", "pracodawca", "panel", "zalogować"],
    synonyms: ["wejść do aplikacji", "sign in"],
    popularity: 94,
    roles: ["employer"],
  },
  {
    id: "login-employee",
    category: "account-and-login",
    categoryLabel: "Konto i logowanie",
    question: "Jak zalogować się jako pracownik?",
    answer:
      "Pracownik może się zalogować po otrzymaniu aktywnego konta przez pracodawcę. Po wejściu na stronę logowania wpisuje e-mail i hasło, a następnie widzi dostępne zlecenia, obecność i urlopy zgodnie z nadanymi uprawnieniami.",
    keywords: ["pracownik", "logowanie", "zalogować"],
    synonyms: ["wejść jako pracownik"],
    popularity: 92,
    roles: ["employee"],
  },
  {
    id: "cant-login",
    category: "account-and-login",
    categoryLabel: "Konto i logowanie",
    question: "Co zrobić, gdy nie mogę się zalogować?",
    answer:
      "Najpierw sprawdź, czy wpisujesz poprawne hasło i czy konto jest aktywne. Jeśli problem utrzymuje się, użyj funkcji zmiany hasła lub wyloguj wszystkie inne sesje. Jeśli nadal nie możesz wejść, skontaktuj się z nami, podając adres e-mail i opis problemu.",
    keywords: ["nie mogę się zalogować", "problem z loginem", "hasło"],
    synonyms: ["nie mogę wejść", "nie działa logowanie"],
    popularity: 90,
    roles: ["all"],
  },
  {
    id: "change-account-data",
    category: "account-and-login",
    categoryLabel: "Konto i logowanie",
    question: "Jak zmienić dane konta?",
    answer:
      "Dane konta zmieniasz w ustawieniach profilu. Możesz zaktualizować wyświetlaną nazwę użytkownika, zmienić hasło oraz zarządzać aktywnymi sesjami. Zmiany są zapisywane natychmiast po kliknięciu przycisku Zapisz.",
    keywords: ["dane konta", "profil", "zmiana nazwy"],
    synonyms: ["edytować profil", "zmienić dane"],
    popularity: 80,
    roles: ["all"],
  },
  {
    id: "change-theme",
    category: "account-and-login",
    categoryLabel: "Konto i logowanie",
    question: "Jak zmienić motyw aplikacji?",
    answer:
      "Motyw aplikacji zmienisz w Ustawieniach w sekcji Wygląd. Dostępne są warianty jasny i ciemny, a wybór jest zapamiętywany dla Twojego konta. W aplikacji PWA motyw działa również po ponownym otwarciu.",
    keywords: ["motyw", "ciemny", "jasny", "theme"],
    synonyms: ["zmienić wygląd", "dark mode", "light mode"],
    popularity: 72,
    roles: ["all"],
  },
  {
    id: "add-employee",
    category: "employees",
    categoryLabel: "Pracownicy",
    question: "Jak dodać pracownika?",
    answer:
      "Pracodawca dodaje pracownika z poziomu zakładki Pracownicy. Po utworzeniu profilu pracownik otrzymuje dostęp do aplikacji oraz może zostać przypisany do firmy i zleceń zgodnie z przyznanymi rolami.",
    keywords: ["dodanie pracownika", "pracownicy", "nowy pracownik"],
    synonyms: ["dodać użytkownika", "utworzyć profil pracownika"],
    popularity: 96,
    roles: ["employer"],
  },
  {
    id: "assign-employee-company",
    category: "employees",
    categoryLabel: "Pracownicy",
    question: "Jak przypisać pracownika do firmy?",
    answer:
      "Po utworzeniu profilu pracownika można go przypisać do konkretnej firmy w panelu pracowników. Jeśli pracownik ma dostęp do wielu firm, wybierasz właściwą organizację i nadajesz mu odpowiednie uprawnienia.",
    keywords: ["przypisać do firmy", "firma", "pracownik"],
    synonyms: ["powiązać pracownika z firmą"],
    popularity: 86,
    roles: ["employer"],
  },
  {
    id: "employee-cant-see-job",
    category: "employees",
    categoryLabel: "Pracownicy",
    question: "Dlaczego pracownik nie widzi zlecenia?",
    answer:
      "Najczęściej dzieje się tak, gdy pracownik nie jest przypisany do danej firmy lub zlecenia, albo nie ma odpowiednich uprawnień. Sprawdź przypisanie w sekcji Pracownicy i upewnij się, że zlecenie jest aktywne oraz przypisane do właściwej osoby.",
    keywords: ["nie widzi zlecenia", "widoczność", "przypisanie"],
    synonyms: ["nie widzi zadania", "nie ma dostępu do zlecenia"],
    popularity: 88,
    roles: ["employer"],
  },
  {
    id: "change-employee-permissions",
    category: "employees",
    categoryLabel: "Pracownicy",
    question: "Jak zmienić uprawnienia pracownika?",
    answer:
      "Uprawnienia pracownika zmienia się z poziomu listy pracowników. W zależności od roli można ograniczyć dostęp do zleceń, obecności, urlopów lub zarządzania firmą. Zmiana wchodzi w życie po zapisaniu ustawień.",
    keywords: ["uprawnienia", "rola", "dostęp"],
    synonyms: ["zmienić role", "nadawać prawa"],
    popularity: 83,
    roles: ["employer"],
  },
  {
    id: "deactivate-employee",
    category: "employees",
    categoryLabel: "Pracownicy",
    question: "Jak dezaktywować pracownika?",
    answer:
      "Pracownika można dezaktywować bez usuwania całego profilu. W panelu pracowników wybierz odpowiednią osobę i zmień jej status, dzięki czemu przestaje mieć dostęp do aktywnych zleceń i funkcji firmy.",
    keywords: ["dezaktywować", "usunąć dostęp", "status"],
    synonyms: ["zablokować pracownika", "wyłączyć konto"],
    popularity: 77,
    roles: ["employer"],
  },
  {
    id: "create-job",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Jak dodać zlecenie?",
    answer:
      "Nowe zlecenie tworzy się w sekcji Zlecenia. Wybierz klienta, określ zakres prac, daty oraz przypisanych pracowników. Po zapisaniu zlecenie jest widoczne w panelu i może być rozwijane etapami.",
    keywords: ["zlecenie", "dodanie zadania", "utworzyć"],
    synonyms: ["utworzyć zadanie", "dodać projekt"],
    popularity: 97,
    roles: ["employer"],
  },
  {
    id: "assign-workers-to-job",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Jak przypisać pracowników do zlecenia?",
    answer:
      "Pracowników przypisuje się podczas tworzenia lub edycji zlecenia. Wybierz odpowiednie osoby z listy pracowników i zapisz zmianę. Dzięki temu widzą zadanie w swoim panelu i mogą aktualizować jego postęp.",
    keywords: ["przypisać pracowników", "zlecenie", "pracownicy"],
    synonyms: ["dodać członków do zadania"],
    popularity: 84,
    roles: ["employer"],
  },
  {
    id: "add-stage",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Jak dodać etap?",
    answer:
      "Etap dodaje się z widoku zlecenia. Wystarczy wskazać nazwę etapu, przypisać kierownika lub wykonawcę i zapisać zmiany. Etap pozostaje powiązany z zleceniem i wyświetlany jest w historii realizacji.",
    keywords: ["etap", "dodanie etapu", "poziom pracy"],
    synonyms: ["dodać fazę", "utworzyć etap"],
    popularity: 89,
    roles: ["employer"],
  },
  {
    id: "stage-manager",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Jak ustawić kierownika etapu?",
    answer:
      "Kierownika etapu ustawia się przy edycji etapu lub na poziomie zlecenia. Wybierz osobę odpowiedzialną i ustaw ją jako koordynatora danego etapu. Dzięki temu ma pełny widok postępu i może kończyć lub cofnięć realizację.",
    keywords: ["kierownik etapu", "odpowiedzialny", "koordynator"],
    synonyms: ["ustawić osobę odpowiedzialną"],
    popularity: 74,
    roles: ["employer"],
  },
  {
    id: "complete-stage",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Jak zakończyć etap?",
    answer:
      "Etap kończy się po kliknięciu akcji Zakończ etap z widoku konkretnego zadania. System zapisuje zmianę i aktualizuje status zlecenia. Jeśli potrzebujesz, możesz cofnąć zakończenie w historii etapów.",
    keywords: ["zakończyć etap", "status etapu", "zamknąć"],
    synonyms: ["zakończyć fazę", "oznaczyć jako gotowe"],
    popularity: 81,
    roles: ["employer"],
  },
  {
    id: "undo-stage",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Jak cofnąć zakończenie etapu?",
    answer:
      "Cofnięcie zakończenia etapu jest dostępne w historii etapów. Wybierz odpowiedni wpis i przywróć poprzedni status. Ta operacja nie usuwa danych zlecenia, a jedynie odwraca ostatnią zmianę statusu.",
    keywords: ["cofnąć etap", "przywrócić", "historia etapów"],
    synonyms: ["odwrócić zakończenie", "przywrócić status"],
    popularity: 67,
    roles: ["employer"],
  },
  {
    id: "stage-history",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Gdzie znajduje się historia etapów?",
    answer:
      "Historia etapów jest dostępna w szczegółach zlecenia, w sekcji historii realizacji. Znajdziesz ją także w kontekście notatek i zmian statusów wykonanych przez zespół.",
    keywords: ["historia etapów", "historia zmian", "log"],
    synonyms: ["dziennik zmian", "historia zlecenia"],
    popularity: 73,
    roles: ["employer"],
  },
  {
    id: "note-history",
    category: "jobs-and-stages",
    categoryLabel: "Zlecenia i etapy",
    question: "Gdzie znajduje się historia notatek?",
    answer:
      "Historia notatek jest dostępna w szczegółach zlecenia i powiązana z konkretnym etapem. Pozwala przejrzeć, co zostało dodane, zmienione lub zakończone przez członków zespołu.",
    keywords: ["historia notatek", "notatki", "komentarze"],
    synonyms: ["dziennik notatek", "historia komentarzy"],
    popularity: 66,
    roles: ["employer"],
  },
  {
    id: "create-budget",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Jak utworzyć kosztorys?",
    answer:
      "Kosztorys tworzy się z poziomu modułu Kosztorysy. Wybierz zlecenie, dodaj pozycje materiałowe i robociznę, a następnie zapisz dokument. Gotowy kosztorys można później eksportować do PDF, Excel lub CSV.",
    keywords: ["kosztorys", "budżet", "utworzyć"],
    synonyms: ["stworzyć kosztorys", "projekt kosztu"],
    popularity: 95,
    roles: ["employer"],
  },
  {
    id: "add-material",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Jak dodać materiał?",
    answer:
      "Materiał dodajesz w edycji kosztorysu na liście pozycji. Wpisz nazwę, jednostkę, cenę oraz ilość i zapisz zmianę. Po zapisaniu pozycja jest uwzględniana w sumie kosztorysu.",
    keywords: ["materiał", "pozycja", "cena"],
    synonyms: ["dodać pozycję materiałową"],
    popularity: 79,
    roles: ["employer"],
  },
  {
    id: "add-labour",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Jak dodać robociznę?",
    answer:
      "Robociznę dodajesz w sekcji kosztorysu, wybierając typ pozycji robociznę i wpisując stawkę oraz czas pracy. Po zapisaniu pozycja wpływa na wartość netto, VAT i brutto dokumentu.",
    keywords: ["robocizna", "praca", "stawka"],
    synonyms: ["dodać pozycję robociznę"],
    popularity: 78,
    roles: ["employer"],
  },
  {
    id: "net-vat-gross",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Jak działa netto, VAT i brutto?",
    answer:
      "Netto oznacza wartość bez podatku VAT, VAT jest uwzględniany jako procent, a brutto to suma netto plus VAT. W kosztorysie wielkości liczone są automatycznie na podstawie zapisanych pozycji i stawek.",
    keywords: ["netto", "vat", "brutto", "podatek"],
    synonyms: ["kwota bez VAT", "kwota z VAT"],
    popularity: 82,
    roles: ["employer"],
  },
  {
    id: "download-pdf",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Jak pobrać PDF?",
    answer:
      "Po utworzeniu kosztorysu kliknij przycisk eksportu i wybierz format PDF. Plik jest generowany lokalnie w przeglądarce i zapisany na urządzeniu, co pozwala go szybko przesłać do klienta lub archiwum.",
    keywords: ["pdf", "pobrać", "eksport"],
    synonyms: ["pobranie dokumentu pdf"],
    popularity: 92,
    roles: ["employer"],
  },
  {
    id: "download-excel",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Jak pobrać Excel?",
    answer:
      "W widoku kosztorysu wybierz eksport do Excel. Plik jest przygotowywany zgodnie z danymi z dokumentu i zapisany na urządzeniu. Jeśli eksport nie działa, sprawdź ustawienia przeglądarki i dostęp do pobierania plików.",
    keywords: ["excel", "xlsx", "eksport"],
    synonyms: ["pobranie arkusza excel"],
    popularity: 88,
    roles: ["employer"],
  },
  {
    id: "download-csv",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Jak pobrać CSV?",
    answer:
      "CSV jest dostępne w menu eksportu kosztorysu. Format jest przydatny do dalszej obróbki w arkuszach kalkulacyjnych i zachowuje strukturę danych pozycji.",
    keywords: ["csv", "eksport", "tabelka"],
    synonyms: ["pobranie pliku csv"],
    popularity: 74,
    roles: ["employer"],
  },
  {
    id: "pdf-phone",
    category: "budgets-and-export",
    categoryLabel: "Kosztorysy i eksport",
    question: "Co zrobić, gdy plik nie pobiera się na telefonie?",
    answer:
      "Na telefonie sprawdź, czy przeglądarka ma włączone pobieranie plików i czy nie blokuje automatycznego zapisu. Możesz też otworzyć dokument w nowej karcie lub zainstalować aplikację PWA i powtórzyć eksport.",
    keywords: ["telefon", "nie pobiera się", "pdf"],
    synonyms: ["nie ściąga się na telefonie"],
    popularity: 71,
    roles: ["all"],
  },
  {
    id: "start-shift",
    category: "attendance",
    categoryLabel: "Obecność",
    question: "Jak rozpocząć pracę?",
    answer:
      "Rozpoczęcie pracy rozpoczyna się z modułu Obecność po kliknięciu przycisku Start. System rejestruje chwilę rozpoczęcia i przypisuje ją do bieżącego dnia pracy.",
    keywords: ["rozpocząć pracę", "start", "obecność"],
    synonyms: ["zaczęcie pracy", "rozpoczęcie zmiany"],
    popularity: 93,
    roles: ["employee"],
  },
  {
    id: "start-break",
    category: "attendance",
    categoryLabel: "Obecność",
    question: "Jak rozpocząć przerwę?",
    answer:
      "Przerwę rozpoczyna się z tego samego modułu Obecność, wybierając odpowiedni stan przerwy. W czasie przerwy system zachowuje zapis kończący i rozpoczynający przerwę.",
    keywords: ["przerwa", "obecność", "pauza"],
    synonyms: ["zaczęcie przerwy"],
    popularity: 76,
    roles: ["employee"],
  },
  {
    id: "end-shift",
    category: "attendance",
    categoryLabel: "Obecność",
    question: "Jak zakończyć pracę?",
    answer:
      "Pracę kończy się po kliknięciu przycisku Zakończ w module Obecność. System zapisuje czas zakończenia i aktualizuje historię pracy dla konkretnego dnia.",
    keywords: ["zakończyć pracę", "koniec zmiany", "stop"],
    synonyms: ["zakończenie zmiany"],
    popularity: 91,
    roles: ["employee"],
  },
  {
    id: "attendance-history",
    category: "attendance",
    categoryLabel: "Obecność",
    question: "Gdzie sprawdzić historię czasu pracy?",
    answer:
      "Historię czasu pracy znajdziesz w module Obecność, w sekcji historii. Tam zobaczysz rozpoczęcia, przerwy i zakończenia pracy z podziałem na dni i zlecenia.",
    keywords: ["historia obecności", "czas pracy", "raport"],
    synonyms: ["sprawdzić godziny pracy"],
    popularity: 80,
    roles: ["employee"],
  },
  {
    id: "attendance-status",
    category: "attendance",
    categoryLabel: "Obecność",
    question: "Dlaczego obecność ma niewłaściwy status?",
    answer:
      "Niewłaściwy status może wynikać z niezamkniętej poprzedniej sesji, braku połączenia lub błędu synchronizacji. Sprawdź ostatnią zmianę, zakończ bieżącą sesję i spróbuj ponownie.",
    keywords: ["status obecności", "błąd", "nieprawidłowy status"],
    synonyms: ["zły status", "błędny stan"],
    popularity: 69,
    roles: ["employee"],
  },
  {
    id: "vacation-request",
    category: "vacations",
    categoryLabel: "Urlopy",
    question: "Jak złożyć wniosek urlopowy?",
    answer:
      "Wniosek urlopowy składa się z modułu Urlopy. Wybierz zakres dat, wpisz powód i wyślij wniosek. Po zatwierdzeniu pojawi się on w historii urlopów oraz w kalendarzu firmy.",
    keywords: ["urlop", "wniosek", "wyjazd"],
    synonyms: ["złożyć prośbę o urlop"],
    popularity: 90,
    roles: ["employee"],
  },
  {
    id: "approve-vacation",
    category: "vacations",
    categoryLabel: "Urlopy",
    question: "Jak zaakceptować urlop?",
    answer:
      "Pracodawca akceptuje urlop z poziomu modułu Urlopy. Wybierz wniosek, sprawdź szczegóły i zatwierdź go. Po akceptacji urlop jest widoczny dla całego zespołu.",
    keywords: ["zaakceptować urlop", "zatwierdzić", "wniosek"],
    synonyms: ["potwierdzić wniosek urlopowy"],
    popularity: 87,
    roles: ["employer"],
  },
  {
    id: "reject-vacation",
    category: "vacations",
    categoryLabel: "Urlopy",
    question: "Jak odrzucić urlop?",
    answer:
      "Urlop odrzuca się w tym samym widoku co akceptacja. Wybierz wniosek, kliknij Odrzuć i wpisz krótki komentarz, jeśli jest potrzebny. Status wniosku zmienia się natychmiast.",
    keywords: ["odrzucić urlop", "odrzucić wniosek", "odmowa"],
    synonyms: ["odrzucić prośbę"],
    popularity: 69,
    roles: ["employer"],
  },
  {
    id: "vacation-history",
    category: "vacations",
    categoryLabel: "Urlopy",
    question: "Gdzie sprawdzić historię urlopów?",
    answer:
      "Historię urlopów znajdziesz w module Urlopy w sekcji historii. Zobaczysz tam status każdego wniosku, daty oraz osoby, które go zatwierdziły lub odrzuciły.",
    keywords: ["historia urlopów", "archiwum", "wnioski"],
    synonyms: ["sprawdzić wcześniejsze urlopy"],
    popularity: 75,
    roles: ["all"],
  },
  {
    id: "add-calendar-event",
    category: "calendar",
    categoryLabel: "Kalendarz",
    question: "Jak dodać wydarzenie?",
    answer:
      "Wydarzenie dodaje się z poziomu Kalendarza po kliknięciu przycisku Nowe wydarzenie. Ustal datę, zakres czasu oraz powiązanie z zespołem lub zleceniem. Po zapisaniu wydarzenie jest widoczne dla uprawnionych użytkowników.",
    keywords: ["wydarzenie", "kalendarz", "termin"],
    synonyms: ["dodać spotkanie", "utworzyć wpis"],
    popularity: 84,
    roles: ["employer"],
  },
  {
    id: "view-planned-work",
    category: "calendar",
    categoryLabel: "Kalendarz",
    question: "Jak sprawdzić zaplanowane prace?",
    answer:
      "Zaplanowane prace widzisz w kalendarzu oraz w widoku zleceń. Filtrowanie po dacie lub pracowniku ułatwia szybkie znalezienie wszystkich aktywności na konkretny dzień.",
    keywords: ["plan pracy", "kalendarz", "terminy"],
    synonyms: ["sprawdzić harmonogram"],
    popularity: 79,
    roles: ["all"],
  },
  {
    id: "who-sees-calendar-events",
    category: "calendar",
    categoryLabel: "Kalendarz",
    question: "Kto widzi wydarzenia w kalendarzu?",
    answer:
      "Wydarzenia w kalendarzu są widoczne dla użytkowników z odpowiednim dostępem do firmy i zleceń. Pracodawca widzi pełen zakres, a pracownik widzi tylko wydarzenia związane z jego zakresem pracy.",
    keywords: ["widoczność kalendarza", "kto widzi"],
    synonyms: ["komu pokazuje się kalendarz"],
    popularity: 64,
    roles: ["all"],
  },
  {
    id: "add-photo",
    category: "photos",
    categoryLabel: "Zdjęcia i galeria",
    question: "Jak dodać zdjęcie?",
    answer:
      "Zdjęcie dodaje się z poziomu zlecenia lub sekcji galerii. Wybierz plik, uzupełnij opis i zapisz. Zdjęcie zostaje powiązane z konkretną realizacją i jest dostępne dla zespołu.",
    keywords: ["zdjęcie", "galeria", "dodać obraz"],
    synonyms: ["wrzucić zdjęcie", "dodać fotografię"],
    popularity: 91,
    roles: ["all"],
  },
  {
    id: "job-gallery",
    category: "photos",
    categoryLabel: "Zdjęcia i galeria",
    question: "Gdzie znajduje się galeria zlecenia?",
    answer:
      "Galeria zlecenia jest dostępna w szczegółach konkretnego zadania. Znajdziesz tam wszystkie zdjęcia związane z realizacją i możesz szybko przejrzeć kolejne etapy pracy.",
    keywords: ["galeria zlecenia", "zdjęcia", "zlecenie"],
    synonyms: ["album zlecenia"],
    popularity: 76,
    roles: ["all"],
  },
  {
    id: "remove-photo",
    category: "photos",
    categoryLabel: "Zdjęcia i galeria",
    question: "Jak usunąć zdjęcie?",
    answer:
      "Zdjęcie usuwa się z widoku galerii lub szczegółów zlecenia po kliknięciu akcji Usuń. Operacja jest natychmiastowa i usuwa plik z powiązanego zasobu.",
    keywords: ["usunąć zdjęcie", "usuń obraz", "galeria"],
    synonyms: ["skasować zdjęcie"],
    popularity: 66,
    roles: ["employer"],
  },
  {
    id: "download-photo",
    category: "photos",
    categoryLabel: "Zdjęcia i galeria",
    question: "Jak pobrać zdjęcie na urządzenie?",
    answer:
      "Zdjęcie pobiera się z galerii po kliknięciu ikony pobierania. Plik jest zapisywany na urządzeniu, a jeśli korzystasz z PWA, możesz go też otworzyć w pełnym ekranie.",
    keywords: ["pobrać zdjęcie", "zapisz obraz", "telefon"],
    synonyms: ["ściągnąć zdjęcie"],
    popularity: 73,
    roles: ["all"],
  },
  {
    id: "enable-notifications",
    category: "notifications",
    categoryLabel: "Powiadomienia",
    question: "Jak włączyć powiadomienia?",
    answer:
      "Powiadomienia włączasz w ustawieniach przeglądarki lub systemu i w aplikacji PWA. Po włączeniu otrzymujesz alerty o zmianach zleceń, nowych wiadomościach i aktualizacjach statusu.",
    keywords: ["powiadomienia", "alerty", "włączyć"],
    synonyms: ["uruchomić powiadomienia"],
    popularity: 93,
    roles: ["all"],
  },
  {
    id: "why-no-notifications",
    category: "notifications",
    categoryLabel: "Powiadomienia",
    question: "Dlaczego nie dostaję powiadomień?",
    answer:
      "Brak powiadomień najczęściej oznacza, że w przeglądarce lub systemie są zablokowane uprawnienia. Sprawdź ustawienia powiadomień dla przeglądarki, aplikacji PWA i systemu operacyjnego.",
    keywords: ["nie dostaję powiadomień", "blokada", "powiadomienia"],
    synonyms: ["nie przychodzą alerty"],
    popularity: 90,
    roles: ["all"],
  },
  {
    id: "pwa-notifications",
    category: "notifications",
    categoryLabel: "Powiadomienia",
    question: "Jak działają powiadomienia w PWA?",
    answer:
      "W aplikacji PWA powiadomienia działają jak w natywnych aplikacjach mobilnych, o ile system i przeglądarka mają włączone uprawnienia. Działa to również na desktopie po zainstalowaniu aplikacji.",
    keywords: ["PWA", "powiadomienia", "aplikacja"],
    synonyms: ["powiadomienia w aplikacji"],
    popularity: 77,
    roles: ["all"],
  },
  {
    id: "install-windows",
    category: "pwa-install",
    categoryLabel: "Instalacja PWA",
    question: "Jak zainstalować VectorWork na Windows?",
    answer:
      "Na Windows otwórz VectorWork w przeglądarce, kliknij przycisk instalacji w pasku adresu lub w menu przeglądarki i wybierz Instaluj aplikację. Po instalacji aplikacja działa jako PWA z własnym oknem.",
    keywords: ["windows", "instalacja", "PWA"],
    synonyms: ["zainstalować na komputerze"],
    popularity: 89,
    roles: ["all"],
  },
  {
    id: "install-android",
    category: "pwa-install",
    categoryLabel: "Instalacja PWA",
    question: "Jak zainstalować VectorWork na Androidzie?",
    answer:
      "Na Androidzie otwórz stronę VectorWork w Chrome i wybierz Dodaj do ekranu głównego. Aplikacja zainstaluje się jako skrót PWA i będzie działać niezależnie od przeglądarki.",
    keywords: ["android", "instalacja", "ekran główny"],
    synonyms: ["zainstalować na telefonie android"],
    popularity: 88,
    roles: ["all"],
  },
  {
    id: "install-ios",
    category: "pwa-install",
    categoryLabel: "Instalacja PWA",
    question: "Jak dodać VectorWork do ekranu głównego iPhone?",
    answer:
      "Na iPhonie otwórz VectorWork w Safari, dotknij przycisku Udostępnij i wybierz Dodaj do ekranu głównego. Po dodaniu aplikacja działa jak PWA i zachowuje się jak natywna aplikacja.",
    keywords: ["iphone", "ios", "ekran główny"],
    synonyms: ["dodać do home screen"],
    popularity: 87,
    roles: ["all"],
  },
  {
    id: "install-macos",
    category: "pwa-install",
    categoryLabel: "Instalacja PWA",
    question: "Jak zainstalować VectorWork na macOS?",
    answer:
      "Na macOS zainstaluj aplikację z przeglądarki Safari lub Chrome, klikając przycisk instalacji. Po instalacji aplikacja będzie dostępna z Docka i uruchamiała się w osobnym oknie.",
    keywords: ["macos", "instalacja", "apple"],
    synonyms: ["zainstalować na Macu"],
    popularity: 72,
    roles: ["all"],
  },
  {
    id: "install-button-missing",
    category: "pwa-install",
    categoryLabel: "Instalacja PWA",
    question: "Dlaczego przycisk instalacji nie jest widoczny?",
    answer:
      "Przycisk instalacji może nie być widoczny, jeśli przeglądarka nie obsługuje PWA, strona jest otwarta w trybie prywatnym lub aplikacja nie spełnia wymagań instalacyjnych. Spróbuj otworzyć stronę w standardowym trybie przeglądarki i zaktualizować przeglądarkę.",
    keywords: ["przycisk instalacji", "PWA", "nie widoczny"],
    synonyms: ["brak przycisku install"],
    popularity: 70,
    roles: ["all"],
  },
  {
    id: "subscription-how-it-works",
    category: "billing",
    categoryLabel: "Płatności i subskrypcja",
    question: "Jak działa subskrypcja?",
    answer:
      "Subskrypcja odblokowuje pełny dostęp do funkcji firmy, w tym zarządzanie pracownikami, zleceniami, kosztorysami i dodatkowymi modułami. Po aktywacji płatność jest rozliczana zgodnie z ustalonym planem.",
    keywords: ["subskrypcja", "plan", "płatność"],
    synonyms: ["jak działa abonament"],
    popularity: 94,
    roles: ["employer"],
  },
  {
    id: "subscription-status",
    category: "billing",
    categoryLabel: "Płatności i subskrypcja",
    question: "Gdzie sprawdzić status subskrypcji?",
    answer:
      "Status subskrypcji sprawdzasz w Ustawieniach w sekcji Subskrypcja. Zobaczysz tam stan płatności, datę końca okresu rozliczeniowego i możliwość zarządzania płatnościami.",
    keywords: ["status subskrypcji", "płatności", "ustawienia"],
    synonyms: ["sprawdzić abonament"],
    popularity: 88,
    roles: ["employer"],
  },
  {
    id: "subscription-ended",
    category: "billing",
    categoryLabel: "Płatności i subskrypcja",
    question: "Co się stanie po zakończeniu subskrypcji?",
    answer:
      "Po zakończeniu subskrypcji dostęp do wybranych funkcji może zostać ograniczony zgodnie z zasadami planu. Wciąż możesz przeglądać dane, ale część modułów może przestać być aktywna do czasu odnowienia płatności.",
    keywords: ["zakończenie subskrypcji", "przerwanie", "dostęp"],
    synonyms: ["po wygaszeniu abonamentu"],
    popularity: 80,
    roles: ["employer"],
  },
  {
    id: "change-payment-method",
    category: "billing",
    categoryLabel: "Płatności i subskrypcja",
    question: "Jak zmienić metodę płatności?",
    answer:
      "Metodę płatności zmieniasz w panelu subskrypcji, korzystając z opcji Zarządzaj płatnościami. Możesz dodać nową kartę lub inny obsługiwany sposób płatności i zapisać zmianę.",
    keywords: ["metoda płatności", "karta", "płatność"],
    synonyms: ["zmienić kartę"],
    popularity: 75,
    roles: ["employer"],
  },
  {
    id: "cancel-subscription",
    category: "billing",
    categoryLabel: "Płatności i subskrypcja",
    question: "Jak anulować subskrypcję?",
    answer:
      "Anulowanie subskrypcji jest dostępne w Ustawieniach. Po kliknięciu Anuluj subskrypcję system zapyta o potwierdzenie i utrzyma dostęp do funkcji do końca aktualnego okresu rozliczeniowego.",
    keywords: ["anulować subskrypcję", "wypisać się", "anulacja"],
    synonyms: ["zakończyć abonament"],
    popularity: 73,
    roles: ["employer"],
  },
  {
    id: "delete-account",
    category: "account-delete",
    categoryLabel: "Usuwanie konta",
    question: "Jak usunąć konto?",
    answer:
      "Usunięcie konta jest dostępne w Ustawieniach w sekcji Strefa zagrożenia. Po kliknięciu Usuń konto musisz potwierdzić operację wpisując USUŃ. Po zakończeniu konto i powiązane dane są usuwane zgodnie z polityką przechowywania.",
    keywords: ["usunąć konto", "dezaktywacja", "konto"],
    synonyms: ["usunięcie profilu"],
    popularity: 82,
    roles: ["employer"],
  },
  {
    id: "what-happens-after-delete",
    category: "account-delete",
    categoryLabel: "Usuwanie konta",
    question: "Co dzieje się z danymi po usunięciu konta?",
    answer:
      "Po usunięciu konta dane użytkownika i związane z nim aktywności są usuwane zgodnie z polityką przechowywania. Jeśli konto jest powiązane z firmą, usunięcie może wpłynąć na dostęp do danych biznesowych, dlatego warto wcześniej skonsultować tę operację.",
    keywords: ["dane po usunięciu", "usuwanie danych", "archiwizacja"],
    synonyms: ["co się stanie z danymi"],
    popularity: 71,
    roles: ["all"],
  },
  {
    id: "delete-account-company",
    category: "account-delete",
    categoryLabel: "Usuwanie konta",
    question: "Czy usunięcie konta usuwa firmę?",
    answer:
      "Nie zawsze. Usunięcie konta użytkownika usuwa jego dostęp, ale firmę i jej dane nie muszą zostać automatycznie usunięte, jeśli są powiązane z innymi użytkownikami lub właścicielem. W razie wątpliwości skontaktuj się z nami.",
    keywords: ["firma", "usunięcie konta", "dane firmy"],
    synonyms: ["czy zniknie firma"],
    popularity: 69,
    roles: ["employer"],
  },
  {
    id: "undo-delete-account",
    category: "account-delete",
    categoryLabel: "Usuwanie konta",
    question: "Czy operację można cofnąć?",
    answer:
      "Po potwierdzeniu usunięcia operacja jest nieodwracalna. Z tego powodu przed usunięciem konta warto sprawdzić, czy nie potrzebujesz już danych ani dostępu do firmy.",
    keywords: ["cofnąć", "usunięcie", "anulować"],
    synonyms: ["czy da się przywrócić"],
    popularity: 63,
    roles: ["all"],
  },
  {
    id: "where-data-stored",
    category: "security",
    categoryLabel: "Bezpieczeństwo i dane",
    question: "Gdzie przechowywane są dane?",
    answer:
      "Dane VectorWork są przechowywane w bezpiecznej chmurze z wykorzystaniem PostgreSQL. To pozwala zachować spójność między desktopem, telefonem i aplikacją PWA bez konieczności ręcznej synchronizacji.",
    keywords: ["przechowywanie danych", "cloud", "postgresql"],
    synonyms: ["gdzie są dane"],
    popularity: 87,
    roles: ["all"],
  },
  {
    id: "who-can-see-company-data",
    category: "security",
    categoryLabel: "Bezpieczeństwo i dane",
    question: "Kto ma dostęp do danych firmy?",
    answer:
      "Dostęp do danych firmy ma wyłącznie zestaw użytkowników z odpowiednimi uprawnieniami oraz właściciel lub administrator. Pracownicy widzą tylko te dane, które są im przypisane lub niezbędne do realizacji zleceń.",
    keywords: ["dostęp do danych", "firma", "uprawnienia"],
    synonyms: ["kto widzi dane firmy"],
    popularity: 84,
    roles: ["employer"],
  },
  {
    id: "employees-see-other-company-data",
    category: "security",
    categoryLabel: "Bezpieczeństwo i dane",
    question: "Czy pracownicy widzą dane innych firm?",
    answer:
      "Nie. Dzięki podziałowi na firmy i role pracownik widzi tylko dane swojej firmy oraz zleceń, do których jest przypisany. Dane innych organizacji nie są mu dostępne.",
    keywords: ["inne firmy", "dane", "prywatność"],
    synonyms: ["czy widzą dane innych firm"],
    popularity: 80,
    roles: ["employer"],
  },
  {
    id: "session-security",
    category: "security",
    categoryLabel: "Bezpieczeństwo i dane",
    question: "Jak chronione są sesje użytkowników?",
    answer:
      "Sesje są obsługiwane z wykorzystaniem bezpiecznych mechanizmów autoryzacji i można je zamykać ręcznie, co ogranicza ryzyko nieautoryzowanego dostępu. W razie potrzeby można też wylogować wszystkie inne sesje z poziomu Ustawień.",
    keywords: ["sesje", "bezpieczeństwo", "autoryzacja"],
    synonyms: ["ochrona logowania"],
    popularity: 79,
    roles: ["all"],
  },
  {
    id: "report-security-issue",
    category: "security",
    categoryLabel: "Bezpieczeństwo i dane",
    question: "Jak zgłosić problem z bezpieczeństwem?",
    answer:
      "Problem z bezpieczeństwem zgłasza się za pośrednictwem kontaktu podanego na stronie. W wiadomości opisz problem, kiedy się pojawił i jakie masz podejrzenia, a my zajmiemy się jego weryfikacją.",
    keywords: ["bezpieczeństwo", "zgłoszenie", "problem"],
    synonyms: ["zgłosić incydent"],
    popularity: 72,
    roles: ["all"],
  },
  {
    id: "technical-problem",
    category: "technical",
    categoryLabel: "Problemy techniczne",
    question: "Co zrobić, gdy aplikacja nie działa poprawnie?",
    answer:
      "Najpierw odśwież stronę i sprawdź połączenie z internetem. Jeśli problem dotyczy tylko jednego urządzenia, spróbuj otworzyć aplikację w innej przeglądarce lub zainstalować wersję PWA. Jeśli problem utrzymuje się, skontaktuj się z nami.",
    keywords: ["awaria", "błąd", "problem techniczny"],
    synonyms: ["aplikacja nie działa"],
    popularity: 91,
    roles: ["all"],
  },
];
