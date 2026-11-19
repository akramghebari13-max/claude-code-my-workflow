-- Size limits on text people type into forms that save straight to the database, so the
-- database itself refuses oversized input whatever the browser sends. NOT VALID: existing rows
-- aren't re-checked (nothing is rejected retrospectively); every new insert and update is.
alter table public.businesses
  add constraint businesses_name_len check (char_length(name) <= 200) not valid,
  add constraint businesses_address_len check (char_length(address) <= 500) not valid,
  add constraint businesses_company_number_len check (char_length(company_number) <= 20) not valid,
  add constraint businesses_utr_len check (char_length(utr) <= 20) not valid,
  add constraint businesses_vat_number_len check (char_length(vat_number) <= 20) not valid;
alter table public.customers
  add constraint customers_name_len check (char_length(name) <= 200) not valid,
  add constraint customers_address_len check (char_length(address) <= 500) not valid,
  add constraint customers_email_len check (char_length(email) <= 254) not valid;
alter table public.accounts
  add constraint accounts_code_len check (char_length(code) <= 10) not valid,
  add constraint accounts_name_len check (char_length(name) <= 100) not valid;
alter table public.profiles
  add constraint profiles_full_name_len check (char_length(full_name) <= 200) not valid;
