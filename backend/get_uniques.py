import pandas as pd
import json

df = pd.read_csv("odisha_realistic_dataset-1.csv")
categorical_cols = ['District', 'Crop', 'Variety', 'Season', 'Soil_Type']
unique_values = {col: sorted(df[col].unique().tolist()) for col in categorical_cols}

print(json.dumps(unique_values))
