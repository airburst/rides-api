-- Get user by session token
select *
from user_clubs
where user_id = (
  select user_id
	from sessions
	where token = '{TOKEN}'
);

-- Set user to role by session token (after first login)
update user_clubs
set role = 'ADMIN' -- or 'LEADER'
where user_id = (
  select user_id
	from sessions
	where token = '{TOKEN}'
);