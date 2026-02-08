with customer_data as (
    select 'Alice Johnson' as customer_name, 'alice.johnson@email.com' as email, 'Gold' as membership_tier, 'New York' as city, 'NY' as state, '2021-06-10' as signup_date union all
    select 'Bob Smith', 'bob.smith@email.com', 'Silver', 'Chicago', 'IL', '2022-03-22' union all
    select 'Carol Davis', 'carol.davis@email.com', 'Gold', 'San Francisco', 'CA', '2020-11-05' union all
    select 'Dan Wilson', 'dan.wilson@email.com', 'Bronze', 'Austin', 'TX', '2023-01-14' union all
    select 'Eva Martinez', 'eva.martinez@email.com', 'Platinum', 'Miami', 'FL', '2019-08-30' union all
    select 'Frank Lee', 'frank.lee@email.com', 'Silver', 'Seattle', 'WA', '2022-07-19' union all
    select 'Grace Kim', 'grace.kim@email.com', 'Gold', 'Denver', 'CO', '2021-02-28' union all
    select 'Hank Brown', 'hank.brown@email.com', 'Bronze', 'Portland', 'OR', '2023-05-11' union all
    select 'Iris Chen', 'iris.chen@email.com', 'Platinum', 'Boston', 'MA', '2020-04-17' union all
    select 'Jack Taylor', 'jack.taylor@email.com', 'Silver', 'Nashville', 'TN', '2022-12-01'
)

select
    customer_name,
    email,
    membership_tier,
    city,
    state,
    signup_date
from customer_data
