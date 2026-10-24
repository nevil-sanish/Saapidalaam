-- Team accounts (BR-41). Students need no allowlist entry: any @iiitkottayam.ac.in Google account is a student (BR-40).
insert into role_allowlist (email, role) values
  ('nevilmathew25bcd11@iiitkottayam.ac.in', 'admin'),
  ('sanjay25bcd07@iiitkottayam.ac.in', 'manager'),
  ('akashdinesh25bcd03@iiitkottayam.ac.in', 'staff')
on conflict (email) do update set role = excluded.role;
-- If someone already signed in before being allowlisted, give them the listed role.
update profiles p set role = a.role from role_allowlist a where p.email = a.email and p.role <> a.role;
