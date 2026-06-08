# Stripe — checklist produkcyjny

Krótka lista kontrolna przed uruchomieniem sprzedaży (Live mode).

## A. Produkty i ceny

- [ ] **Product: plan bazowy** — recurring, monthly, **400,00 PLN**
- [ ] **Price ID → `STRIPE_PRICE_BASE_400`**
- [ ] **Product: dodatkowe stanowisko** — recurring, monthly, **40,00 PLN** per seat
- [ ] **Price ID → `STRIPE_PRICE_EXTRA_SEAT_40`**

## B. Coupon intro

- [ ] **Coupon ID → `STRIPE_COUPON_INTRO_2M_250`**
- [ ] **`amount_off`:** 150,00 PLN (`15000` groszy)
- [ ] **`currency`:** `pln`
- [ ] **`duration`:** `repeating`
- [ ] **`duration_in_months`:** `2`
- [ ] **`applies_to`:** tylko Product ID planu bazowego (nie extra seat)

## C. Customer Portal

- [ ] Payment methods — **enabled**
- [ ] Invoices — **enabled**
- [ ] Billing history — **enabled**
- [ ] Plan changes (switch products/prices) — **disabled**
- [ ] Quantity changes — **disabled**
- [ ] Portal promotions — **disabled**
- [ ] Cancellation — **enabled**, tylko **at period end** (nie immediate)

## D. Webhook events

Endpoint produkcyjny: `POST /api/stripe/webhook`

- [ ] `checkout.session.completed`
- [ ] `customer.subscription.updated`
- [ ] `customer.subscription.deleted`
- [ ] `invoice.paid`
- [ ] `invoice.payment_failed`

## E. Production ENV

- [ ] `STRIPE_SECRET_KEY` — live secret key
- [ ] `STRIPE_WEBHOOK_SECRET` — secret live webhook endpoint
- [ ] `STRIPE_PRICE_BASE_400`
- [ ] `STRIPE_PRICE_EXTRA_SEAT_40`
- [ ] `STRIPE_COUPON_INTRO_2M_250`
- [ ] `STRIPE_INCLUDED_SEATS=10`
- [ ] `NEXT_PUBLIC_APP_URL` — publiczny URL aplikacji (bez localhost)

## F. Test E2E (staging / live smoke)

- [ ] Nowa subskrypcja (checkout + webhook)
- [ ] Utworzenie firmy
- [ ] Do 10 aktywnych osób — brak dopłaty seat
- [ ] 11. osoba — extra seat qty = 1
- [ ] 12. osoba — extra seat qty = 2
- [ ] Dezaktywacja pracownika — spadek qty
- [ ] Usunięcie pracownika — spadek qty
- [ ] Cancel at period end — dostęp do końca okresu
- [ ] Resume subskrypcji
- [ ] Customer Portal — karta, faktury (bez zmiany planu/qty)
- [ ] Ponowny checkout po wygaśnięciu
