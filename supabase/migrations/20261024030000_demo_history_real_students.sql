-- Demo history for the owner's real student accounts so their dashboards aren't empty. Runs once.
do $$
declare
  st record; d date; s record; v_diet text; price bigint; st_status text; staff uuid;
begin
  if exists (select 1 from job_runs where name = 'demo_history_real') then return; end if;
  select id into staff from profiles where role in ('staff', 'admin') order by role desc limit 1;

  for st in select id from profiles
            where email in ('navaneetgopalan25bcd15@iiitkottayam.ac.in', 'kutalaeshanth25bcd19@iiitkottayam.ac.in') loop
    -- Past week: mostly lunch + dinner, eaten, one no-show.
    for d in select g::date from generate_series(current_date - 7, current_date - 1, interval '1 day') g loop
      for s in select id, code, start_time from meal_slots where code in ('B', 'L', 'D') loop
        continue when s.code = 'B' and random() < 0.6;
        v_diet := case when s.code = 'D' and extract(isodow from d) in (2, 5, 7) then 'nonveg' else 'veg' end;
        select amount into price from prices where slot_id = s.id and prices.diet = v_diet;
        st_status := case when d = current_date - 3 and s.code = 'B' then 'no_show' else 'served' end;
        insert into bookings (student_id, served_on, slot_id, diet, source, price_snapshot, status, cutoff_at, locked_at)
        values (st.id, d, s.id, v_diet, case when s.code = 'B' then 'oneoff' else 'pattern' end, price, st_status,
                ((d + s.start_time) at time zone 'Asia/Kolkata') - interval '24 hours',
                ((d + s.start_time) at time zone 'Asia/Kolkata') - interval '24 hours')
        on conflict do nothing;
        insert into ledger_entries (student_id, kind, amount, booking_id, note, created_at)
        select st.id, 'meal_charge', -price, b.id, 'charged at cutoff (demo)', b.cutoff_at
        from bookings b where b.student_id = st.id and b.served_on = d and b.slot_id = s.id
          and not exists (select 1 from ledger_entries l where l.booking_id = b.id);
        if st_status = 'served' and staff is not null then
          insert into scans (booking_id, student_id, staff_id, method, result, scanned_at)
          select b.id, st.id, staff, 'qr', 'served', ((d + s.start_time) at time zone 'Asia/Kolkata') + interval '25 minutes'
          from bookings b where b.student_id = st.id and b.served_on = d and b.slot_id = s.id;
        end if;
      end loop;
    end loop;
    -- Next week: lunch + dinner booked (still changeable).
    for d in select g::date from generate_series(current_date + 2, current_date + 7, interval '1 day') g loop
      for s in select id, start_time from meal_slots where code in ('L', 'D') loop
        select amount into price from prices where slot_id = s.id and prices.diet = 'veg';
        insert into bookings (student_id, served_on, slot_id, diet, source, price_snapshot, status, cutoff_at)
        values (st.id, d, s.id, 'veg', 'pattern', price, 'booked', ((d + s.start_time) at time zone 'Asia/Kolkata') - interval '24 hours')
        on conflict do nothing;
      end loop;
    end loop;
    insert into notifications (user_id, title, body) values
      (st.id, 'Menu published', 'The October menu is out. Confirm or pick your monthly package.'),
      (st.id, 'Deposit verified', 'Your ₹30,000.00 semester deposit was verified by the admin.'),
      (st.id, 'Special meal announced', 'Sunday dinner: chicken biryani. Prebook before the cutoff.');
  end loop;

  insert into job_runs values ('demo_history_real', now()) on conflict (name) do update set last_run = now();
end $$;
