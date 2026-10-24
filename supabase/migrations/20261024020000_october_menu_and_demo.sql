-- October 2026 mess menu (from the mess notice) + slot times printed on it + dummy data for demo dashboards.
-- Idempotent: safe to re-run (the app re-applies migrations on boot).

-- Slot times from the notice: B 7:00–9:30, L 12:00–2:30, S 4:00–6:00, D 7:00–8:30 pm.
update meal_slots set start_time = '07:00', end_time = '09:30' where code = 'B';
update meal_slots set start_time = '12:00', end_time = '14:30' where code = 'L';
update meal_slots set start_time = '16:00', end_time = '18:00' where code = 'S';
update meal_slots set start_time = '19:00', end_time = '20:30' where code = 'D';

-- Weekly menu (ISO dow 1=Mon … 7=Sun). nonveg = full plate; veg = same without meat/egg items.
drop table if exists _menu;
create temp table _menu (dow int, slot text, veg text, nonveg text);
insert into _menu values
 (1,'B','Dosa, Medu vada, Aloo masala, Sambar, Coconut chutney, Bread (normal/brown), Jam, Butter, Tea, Milk', null),
 (1,'L','Kerala rice, Rice, Roti, Parippu dal, Beans poriyal, Rasam, Kondattam, Chips, Puliyinchi, Curd, Fruit: Watermelon', null),
 (1,'S','Pazhampuri, Bread, Jam, Butter, Coffee, Milk', null),
 (1,'D','Rice, Roti, Tomato chilli gravy, Beetroot thoran, Dal, Papad, Curd, Salad, Drink: Mango', 'Rice, Roti, Boiled egg, Tomato chilli gravy, Beetroot thoran, Dal, Papad, Curd, Salad, Drink: Mango'),
 (2,'B','Vada pav, Puttu, Channa curry, Fried chillies, Onions, Green chutney, Red powdered chutney, Banana, Bread (normal/brown), Jam, Butter, Coffee, Milk', null),
 (2,'L','Veg pulao, Paneer butter masala, Onion raita, Salad, Drink: Tang', 'Veg pulao, Chicken masala curry, Paneer butter masala, Onion raita, Salad, Drink: Tang'),
 (2,'S','Cream bun, Bread, Jam, Butter, Tea, Milk', null),
 (2,'D','Rice, Roti, Rajma curry, Onion dal tadka, Bottle gourd stir fry, Rasam, Chips, Salad, Curd, Drink: Orange', null),
 (3,'B','Idli, Masala idli punugulu, Sambar, Groundnut chutney, Tomato chutney, Bread (normal/brown), Jam, Butter, Tea, Milk', null),
 (3,'L','Roti, Rice, Onion dal tadka, Kerala rice, Soya chunks dry, Pulissery, Pachipulusu, Curd, Salad, Sweet: Vermicelli kesari', null),
 (3,'S','Sweetcorn (boiled), Bread, Jam, Butter, Tea, Milk', null),
 (3,'D','Rice, Roti, Tomato dal, Chilli potato, Brinjal curry, Salad, Curd', null),
 (4,'B','Pesarattu, Rava upma, Groundnut chutney, Banana, Cornflakes, Puliyinchi, Bread (normal/brown), Jam, Butter, Tea, Milk', null),
 (4,'L','Rice, Roti, Mudda pappu, Pachi pulusu, Potato 65, Koottu curry, Tomato chilli chutney, Fruit: Watermelon, Drink: Buttermilk', null),
 (4,'S','Masala puri chaat, Bread, Jam, Butter, Coffee, Milk', null),
 (4,'D','Veg fried rice, Masala onion gravy, Roti, Green peas masala, Onion raita, Salad, Drink: Passion fruit', 'Egg fried rice, Veg fried rice, Masala onion gravy, Roti, Green peas masala, Onion raita, Salad, Drink: Passion fruit'),
 (5,'B','Pav bhaji, Lemons, Onions, Uggani (puffed rice), Roasted chana podi, Bread (normal/brown), Jam, Butter, Coffee, Milk', null),
 (5,'L','Ghee rice, Kadai paneer, Vegetable raita, Salad, Drink: Pineapple/Mango', 'Ghee rice, Chicken roast (dry), Kadai paneer, Vegetable raita, Salad, Drink: Pineapple/Mango'),
 (5,'S','Bhel puri, Bread, Jam, Butter, Tea, Milk', null),
 (5,'D','Rice, Roti, Aloo matar, Spicy dal tadka, Ivy gourd fry, Kanji, Chammanthi, Curd, Rasam, Salad, Sweet: Vermicelli payasam', null),
 (6,'B','Idli, Podi idli / Vermicelli upma, Corn flakes, Coconut chutney, Sambar, Bread (normal/brown), Jam, Butter, Coffee, Milk', null),
 (6,'L','Rice, Kerala rice, Roti, Mudda pappu, Pachi pulusu, Pulissery, Cabbage thoran, Chips, Curd, Fruit: Watermelon', null),
 (6,'S','Samosa, Bread, Jam, Butter, Coffee, Milk', null),
 (6,'D','Jeera rice, Rice, Roti, Small soya curry, Sambar, Coriander tomato chutney, Chips, Curd, Salad, Sweet: Ada payasam', null),
 (7,'B','Puri masala, Pongal, Groundnut podi, Sprouts, Banana, Bread (normal/brown), Jam, Tea, Milk', 'Puri masala, Pongal, Groundnut podi, Boiled egg, Sprouts, Banana, Bread (normal/brown), Jam, Tea, Milk'),
 (7,'L','Kerala rice, Rice, Roti, Carrot cabbage chana thoran, Onion dal tadka, Rasam, Curd, Coriander tomato chutney, Salad, Drink: Sweet lassi', null),
 (7,'S','Sweet naan, Bread, Jam, Butter, Tea, Milk', null),
 (7,'D','Paneer biryani, Veg gravy, Onion raita, Papad, Salad, Drink: Tang', 'Chicken biryani, Paneer biryani, Veg gravy, Chicken chilli, Onion raita, Papad, Salad, Drink: Tang');

-- Oct + Nov 2026 (November repeats the October weekly cycle until the new notice is published).
insert into menu_entries (served_on, slot_id, diet, items)
select d::date, s.id, x.diet, x.items
from generate_series('2026-10-01'::date, '2026-11-30'::date, interval '1 day') d
join _menu m on m.dow = extract(isodow from d)::int
join meal_slots s on s.code = m.slot
cross join lateral (values ('veg', m.veg), ('nonveg', coalesce(m.nonveg, m.veg))) x(diet, items)
on conflict (served_on, slot_id, diet) do update set items = excluded.items
  where menu_entries.special_price is null;

insert into menu_months (month) values ('2026-10-01'), ('2026-11-01') on conflict do nothing;

-- Real student accounts provided by the owner (sign in with Google; profile pre-created so the dummy deposit attaches).
insert into profiles (email, full_name, roll_no) values
  ('navaneetgopalan25bcd15@iiitkottayam.ac.in', 'Navaneet Gopalan', '2025BCD0015'),
  ('kutalaeshanth25bcd19@iiitkottayam.ac.in', 'Kutala Eshanth', '2025BCD0019')
on conflict (email) do nothing;

-- Dummy students + money + bookings so dashboards have data. Runs once (guarded by the demo marker).
do $$
declare
  st record; d date; s record; v_diet text; price bigint; st_status text; staff uuid; n int := 0;
begin
  if exists (select 1 from ledger_entries where ref = 'DEMO-SEED') then return; end if;

  insert into profiles (email, full_name, roll_no)
  select format('demo.student%s@iiitkottayam.ac.in', lpad(i::text, 2, '0')),
         (array['Aditya','Ananya','Arjun','Diya','Farhan','Gauri','Harsh','Ishita','Joel','Kavya','Lakshmi','Manav','Nikhil','Pooja','Rahul','Sneha','Tanvi','Vishnu'])[i] || ' (demo)',
         format('2025BCD9%s', lpad(i::text, 3, '0'))
  from generate_series(1, 18) i
  on conflict (email) do nothing;

  -- Verified ₹30,000 semester deposit for every student without one (dummy txn refs).
  for st in select p.id from profiles p where p.role = 'student'
            and not exists (select 1 from deposits x where x.student_id = p.id) loop
    insert into deposits (student_id, amount, txn_ref, status, verified_at) values (st.id, 3000000, 'DEMO-' || left(st.id::text, 8), 'verified', now());
    insert into ledger_entries (student_id, kind, amount, ref, note) values (st.id, 'deposit', 3000000, 'DEMO-SEED', 'Demo verified deposit');
  end loop;

  select id into staff from profiles where role in ('staff', 'admin') order by role desc limit 1;

  -- Past 10 days: locked → served (≈85%) or no_show, with charges posted. Only dummy students.
  for st in select id from profiles where email like 'demo.student%' loop
    for d in select g::date from generate_series(current_date - 10, current_date - 1, interval '1 day') g loop
      for s in select id, start_time from meal_slots loop
        continue when random() < 0.25; -- not every meal booked (opt-in, BR-01)
        v_diet := case when random() < 0.6 then 'veg' else 'nonveg' end;
        select amount into price from prices where slot_id = s.id and prices.diet = v_diet;
        st_status := case when random() < 0.85 then 'served' else 'no_show' end;
        insert into bookings (student_id, served_on, slot_id, diet, source, price_snapshot, status, cutoff_at, locked_at)
        values (st.id, d, s.id, v_diet, 'oneoff', price, st_status, ((d + s.start_time) at time zone 'Asia/Kolkata') - interval '24 hours',
                ((d + s.start_time) at time zone 'Asia/Kolkata') - interval '24 hours')
        on conflict do nothing;
        insert into ledger_entries (student_id, kind, amount, booking_id, note, created_at)
        select st.id, 'meal_charge', -price, b.id, 'charged at cutoff (demo)', b.cutoff_at
        from bookings b where b.student_id = st.id and b.served_on = d and b.slot_id = s.id and b.status = st_status;
        if st_status = 'served' and staff is not null then
          insert into scans (booking_id, student_id, staff_id, method, result, scanned_at)
          select b.id, st.id, staff, case when random() < 0.1 then 'backup' else 'qr' end, 'served',
                 ((d + s.start_time) at time zone 'Asia/Kolkata') + (random() * interval '80 minutes')
          from bookings b where b.student_id = st.id and b.served_on = d and b.slot_id = s.id;
        end if;
        n := n + 1;
      end loop;
    end loop;
    -- Next 7 days: future bookings (booked, still changeable) so the manager sees demand.
    for d in select g::date from generate_series(current_date + 2, current_date + 8, interval '1 day') g loop
      for s in select id, start_time from meal_slots loop
        continue when random() < 0.35;
        v_diet := case when random() < 0.6 then 'veg' else 'nonveg' end;
        select amount into price from prices where slot_id = s.id and prices.diet = v_diet;
        insert into bookings (student_id, served_on, slot_id, diet, source, price_snapshot, status, cutoff_at)
        values (st.id, d, s.id, v_diet, 'pattern', price, 'booked', ((d + s.start_time) at time zone 'Asia/Kolkata') - interval '24 hours')
        on conflict do nothing;
      end loop;
    end loop;
  end loop;

  -- A few failed scan attempts for the audit page.
  if staff is not null then
    insert into scans (student_id, staff_id, method, result, scanned_at)
    select null, staff, 'qr', 'invalid_token', now() - (i * interval '3 hours') from generate_series(1, 4) i;
  end if;

  -- One pending deposit for the admin finance queue.
  insert into deposits (student_id, amount, txn_ref, status)
  select id, 500000, 'UTR' || floor(random() * 1e9)::text, 'pending' from profiles where email = 'demo.student01@iiitkottayam.ac.in';

  insert into job_runs values ('demo_seed', now()) on conflict (name) do update set last_run = now();
end $$;
drop table if exists _menu;
