with funny as (
    select * from {{ref('funny_dbt_model')}}
)

, m2 as (
    select * from {{ ref('my_second_dbt_model')}}
)

, combo as (
    select * from funny 
    union all by name 
    select * from m2 
)

select * from combo 