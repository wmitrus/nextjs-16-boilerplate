Tak — Twój kierunek jest zasadniczo poprawny, ale trzeba go doprecyzować, żeby był w 100% zgodny z tym, co Clerk faktycznie wspiera natywnie.

Co Clerk wspiera natywnie dzisiaj

Clerk natywnie wspiera model B2B oparty o Organizations w jednej aplikacji Clerk. W tym modelu:

jedna aplikacja Clerk może mieć wiele Organizations,
użytkownik może należeć do wielu Organizations,
role i permissions definiujesz na poziomie aplikacji, a potem stosujesz je w Organizations,
w sesji masz pojęcie Active Organization,
orgId z Clerk odnosi się do aktywnej Organization, nie do jakiegoś nadrzędnego „tenantu”.

Clerk wprost pisze też, że w scenariuszu B2B organizacje są podstawowym sposobem modelowania multi-tenant SaaS, a Organization ID powinno się zapisywać przy zasobach w bazie, żeby filtrować dane wg aktywnej organizacji.

Czego Clerk nie wspiera natywnie jako gotowy model

Clerk nie wspiera obecnie natywnie scenariusza Platforms. W ich dokumentacji „Platforms” to scenariusz z:

izolowanymi user pools per customer,
osobnym brandingiem per customer,
niezależnymi politykami bezpieczeństwa,
osobnymi limitami,
często custom/vanity domains dla klientów.

I tu Clerk mówi to wprost:
„Today, Clerk does not currently support the Platforms scenario.”

To oznacza praktycznie, że Clerk nie daje Ci dziś natywnego, wyższego poziomu typu parent tenant / tenant-of-tenants / hierarchical organizations jako oficjalnego modelu platformowego.

Czy Clerk ma natywne parent org / nested orgs?

Na podstawie oficjalnych materiałów, które sprawdziłem: nie znalazłem w dokumentacji Clerk natywnego modelu parent organization / nested organizations / organization hierarchy. Dokumentacja opisuje Organizations jako byty żyjące wewnątrz aplikacji Clerk, a nie jako strukturę wielopoziomową. Clerk mówi:

aplikacja może zawierać wiele Organizations,
każda Organization może mieć wielu użytkowników,
role i permissions definiujesz raz na poziomie aplikacji.

To bardzo mocno wskazuje, że model jest flat, a nie hierarchiczny.
Nie widzę w oficjalnych docs podstaw, żeby twierdzić, że Clerk ma dziś natywne „org nadrzędne → org podrzędne”.

Ocena Twojego modelu

Twoje założenie:

EduGroup = app-level DB entity (internal top-level tenant)
Schools = Clerk orgs
Clerk orgId → maps to internal organization, not tenant

jest zgodne z tym, co Clerk realnie wspiera, pod warunkiem że rozumiesz jedną ważną rzecz:

ten „tenant” nie będzie bytem natywnym Clerk, tylko Twoim własnym bytem domenowym / platformowym w bazie aplikacji.

Czyli profesjonalnie rzecz ujmując:

Clerk Organization = jednostka, na której Clerk daje membership, role, active org, invitations, verified domains, enterprise SSO linkage itp.
Twój internal tenant = nadrzędny byt biznesowy/platformowy, który sam modelujesz w swojej bazie, bo Clerk nie daje Ci dziś natywnego poziomu „platform customer with isolated app-like config”.
Co dokładnie możesz oprzeć o Clerk Organization

Dla pojedynczej szkoły jako Clerk Organization masz natywnie:

membership użytkowników,
role i permissions w obrębie organization,
active organization context,
invitations,
verified domains,
organization-level enterprise SSO linkage / per-domain enforcement.

To czyni „school = Clerk organization” bardzo sensownym modelem, jeśli szkoła jest Twoją jednostką operacyjną.

Czego nie powinieneś przypisywać Clerk orgowi, jeśli chcesz mieć wyższy poziom tenantu

Jeśli masz model typu:

EduGroup
School A
School B
School C

to EduGroup nie powinieneś udawać jako Clerk parent org, bo nie ma na to natywnego mechanizmu w oficjalnym modelu Clerk. Zamiast tego:

tenant / education_group trzymasz w swojej bazie,
każda school ma referencję do tenant_id,
każda school ma też clerk_organization_id,
użytkownik w Clerk działa przez członkostwo w organization,
a Twoja aplikacja dokleja jeszcze własny poziom nadrzędny tenant/group.
Najbezpieczniejszy wniosek

To zdanie byłoby poprawne:

Clerk Organizations są dziś natywnym kontenerem B2B/multi-tenant wewnątrz jednej aplikacji Clerk, ale jeśli potrzebujesz nadrzędnego poziomu typu EduGroup → Schools, to ten poziom musisz modelować samodzielnie w swojej bazie; orgId z Clerk mapuje się do organization/workspace, a nie do nadrzędnego tenantu platformowego.

Czego bym nie powiedział kategorycznie

Nie powiedziałbym bezpośrednio:
„Clerk tworzy hard boundary jak tenant platformowy.”

Bo to zależy, jaki boundary masz na myśli.

Clerk Organization daje Ci mocny boundary autoryzacyjny i kontekstowy w ramach wspólnej aplikacji i shared user-pool B2B.

Ale Clerk sam odróżnia ten model od „Platforms”, gdzie boundary jest dalej idący: własne user pools, branding, security policies, limity, custom domains per customer — i właśnie tego scenariusza Clerk obecnie nie wspiera natywnie.

Czyli:

hard boundary na poziomie organization context / authZ / org-scoped resources — tak
hard boundary na poziomie pełnego platform tenantu — nie jako natywna funkcja Clerk today.
Finalny werdykt dla Twojej tezy

Twoja teza jest bliska poprawnej i w praktyce dobra, ale najprecyzyjniej powinna brzmieć tak:

W Clerk nie ma dziś natywnego parent-tenant / nested-org modelu platformowego. Dlatego jeśli potrzebujemy struktury EduGroup → Schools, to EduGroup modelujemy jako własny byt aplikacyjny w bazie, a Schools jako Clerk Organizations. Wtedy clerkOrgId mapuje się do school/organization, a nie do nadrzędnego tenantu.
