import pandas as pd
import numpy as np
import joblib
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error

# 1. Load Dataset
df = pd.read_csv("odisha_realistic_dataset-1.csv")
df = df.dropna()

# 2. Feature Engineering
def engineer_features(data):
    data['NPK_sum'] = data['N'] + data['P'] + data['K']
    data['Fertility_Index'] = (data['N'] + data['P'] + data['K']) / 3
    data['Input_Intensity'] = data['Fertilizer_Usage'] + data['Pesticide_Usage']
    data['Stress'] = data['Temperature'] * data['Pest_Index']
    data['Water_Stress'] = data['Temperature'] / (data['Rainfall'] + 1)
    data['Water_Efficiency'] = data['Rainfall'] / (data['Irrigation'] + 1)
    data['Yield_Factor'] = data['Rainfall'] * data['NPK_sum']
    return data

df = engineer_features(df)

# 3. Encoding
categorical_cols = ['District', 'Crop', 'Season', 'Soil_Type', 'Variety']
df_encoded = pd.get_dummies(df, columns=categorical_cols)

# 4. Features & Target
X = df_encoded.drop('Yield', axis=1)
y = df_encoded['Yield']

# 5. Train-Test Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 6. Train XGBoost Model
model = XGBRegressor(
    n_estimators=100,
    learning_rate=0.1,
    max_depth=5,
    random_state=42
)
model.fit(X_train, y_train)

# 7. Evaluation
y_pred = model.predict(X_test)
print(f"R2 Score: {r2_score(y_test, y_pred)}")
print(f"RMSE: {np.sqrt(mean_squared_error(y_test, y_pred))}")

# 8. Save Model and Features
joblib.dump(model, "model.pkl")
joblib.dump(X.columns.tolist(), "features.pkl")

print("Model and features saved successfully!")
