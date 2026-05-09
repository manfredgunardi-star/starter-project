-- ============================================================
-- Migration 010: Helper Functions & Auto-numbering
-- ============================================================

-- Sequence table for auto-numbering documents
create table sequences (
  name text primary key,
  last_value bigint not null default 0
);

-- Insert initial sequences for all document types
insert into sequences (name, last_value) values
  ('SO', 0), ('PO', 0), ('INV-S', 0), ('INV-P', 0),
  ('PAY', 0), ('JRN', 0), ('GR', 0), ('GD', 0), ('TRF', 0);

-- Generate next document number: SO-2026-00001, INV-S-2026-00001, etc.
create or replace function generate_number(p_prefix text)
returns text as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  update sequences set last_value = last_value + 1
    where name = p_prefix
    returning last_value into v_next;

  if v_next is null then
    insert into sequences (name, last_value) values (p_prefix, 1);
    v_next := 1;
  end if;

  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 5, '0');
end;
$$ language plpgsql;

-- Convert quantity from one unit to base unit for a product
create or replace function convert_to_base_unit(
  p_product_id uuid,
  p_from_unit_id uuid,
  p_quantity numeric
)
returns numeric as $$
declare
  v_base_unit_id uuid;
  v_factor numeric;
begin
  select base_unit_id into v_base_unit_id from products where id = p_product_id;

  -- Already in base unit
  if p_from_unit_id = v_base_unit_id then
    return p_quantity;
  end if;

  -- Find conversion factor
  select conversion_factor into v_factor
    from unit_conversions
    where product_id = p_product_id
      and from_unit_id = p_from_unit_id
      and to_unit_id = v_base_unit_id;

  if v_factor is null then
    raise exception 'No unit conversion found for product % from unit % to base unit %',
      p_product_id, p_from_unit_id, v_base_unit_id;
  end if;

  return p_quantity * v_factor;
end;
$$ language plpgsql stable;

-- Validate journal balance (total debit must equal total credit)
create or replace function validate_journal_balance(p_journal_id uuid)
returns boolean as $$
declare
  v_total_debit numeric;
  v_total_credit numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_total_debit, v_total_credit
    from journal_items where journal_id = p_journal_id;

  return v_total_debit = v_total_credit and v_total_debit > 0;
end;
$$ language plpgsql stable;
