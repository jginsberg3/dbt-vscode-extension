# project goals

the goal for this project is to create a vs code extension to assist with dbt development.  

key features:
1. enable "go to dbt model" functionality from within dbt sql files.
2. display a visual of the dbt DAG graph.  the graph should highlight the model currently open and follow the user as they move between model files.
3. allow the user to switch between multiple dbt projects within the same repo and mantain the above functionality.

# approach
use the `manifest.json` file dbt creates to understand the dbt project DAG graph.



# to-dos
- model name completion
- dbt syntax completion
