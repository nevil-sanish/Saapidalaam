-- Fake data only. D-12 provisional slots.
insert into semesters (name, starts_on, ends_on) values ('Monsoon 2026', '2026-07-20', '2026-12-20') on conflict do nothing;
insert into meal_slots (code,label,start_time,end_time,sort) values
 ('B','Breakfast','07:30','09:30',0),('L','Lunch','12:30','14:00',1),('S','Snacks','16:30','17:30',2),('D','Dinner','19:30','21:30',3)
 on conflict (code) do nothing;
insert into prices select id, 'veg', v from (values ('B',4000),('L',7000),('S',2500),('D',7000)) x(c,v) join meal_slots on code=c on conflict do nothing;
insert into prices select id, 'nonveg', v from (values ('B',5000),('L',9000),('S',3000),('D',9500)) x(c,v) join meal_slots on code=c on conflict do nothing;
