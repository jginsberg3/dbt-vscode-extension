with sales_data as (
    select 1 as order_id, 'Alice Johnson' as customer_name, 'Laptop' as product, 2 as quantity, 999.99 as unit_price, '2024-01-15' as order_date union all
    select 2, 'Bob Smith', 'Wireless Mouse', 5, 29.99, '2024-01-18' union all
    select 3, 'Carol Davis', 'Monitor', 1, 349.00, '2024-02-03' union all
    select 4, 'Dan Wilson', 'Keyboard', 3, 74.50, '2024-02-14' union all
    select 5, 'Eva Martinez', 'Laptop', 1, 1249.99, '2024-03-01' union all
    select 6, 'Frank Lee', 'Headphones', 4, 59.95, '2024-03-10' union all
    select 7, 'Grace Kim', 'Webcam', 2, 89.00, '2024-03-22' union all
    select 8, 'Hank Brown', 'Monitor', 2, 299.99, '2024-04-05' union all
    select 9, 'Iris Chen', 'Keyboard', 1, 129.99, '2024-04-18' union all
    select 10, 'Jack Taylor', 'Laptop', 1, 1099.00, '2024-05-02'
)

select
    order_id,
    customer_name,
    product,
    quantity,
    unit_price,
    quantity * unit_price as total_amount,
    order_date
from sales_data
