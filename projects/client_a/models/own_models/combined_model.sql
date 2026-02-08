select *
from {{ ref('sales_data') }} s
left join {{ ref('customer_data') }} c
    on s.customer_name = c.customer_name
