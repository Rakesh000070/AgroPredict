import sys
import json
import pandas as pd
import joblib
import os

def engineer_features(data):
    data['NPK_sum'] = data['N'] + data['P'] + data['K']
    data['Fertility_Index'] = (data['N'] + data['P'] + data['K']) / 3
    data['Input_Intensity'] = data['Fertilizer_Usage'] + data['Pesticide_Usage']
    data['Stress'] = data['Temperature'] * data['Pest_Index']
    data['Water_Stress'] = data['Temperature'] / (data['Rainfall'] + 1)
    data['Water_Efficiency'] = data['Rainfall'] / (data['Irrigation'] + 1)
    data['Yield_Factor'] = data['Rainfall'] * data['NPK_sum']
    return data

def main():
    try:
        # Load model and features
        if not os.path.exists("model.pkl") or not os.path.exists("features.pkl"):
            print(json.dumps({"error": "Model files not found. Please train the model first."}))
            sys.exit(1)

        model = joblib.load("model.pkl")
        feature_cols = joblib.load("features.pkl")

        # Read input from stdin
        input_data = json.load(sys.stdin)
        
        # If input is empty (status check), just return a dummy success
        if not input_data:
            print(json.dumps({"status": "ready"}))
            sys.exit(0)
        
        # Convert to DataFrame
        # The input keys from React might be lowercase, so we map them to the CSV column names
        # React inputs: year, crop, variety, season, soilType, temperature, humidity, rainfall, n, p, k, fertilizer, pesticide, irrigation, pestIndex
        # CSV columns: Year, Crop, Variety, Season, Soil_Type, Temperature, Humidity, Rainfall, N, P, K, Fertilizer_Usage, Pesticide_Usage, Irrigation, Pest_Index
        
        mapping = {
            "year": "Year",
            "district": "District",
            "crop": "Crop",
            "variety": "Variety",
            "season": "Season",
            "soilType": "Soil_Type",
            "temperature": "Temperature",
            "humidity": "Humidity",
            "rainfall": "Rainfall",
            "n": "N",
            "p": "P",
            "k": "K",
            "fertilizer": "Fertilizer_Usage",
            "pesticide": "Pesticide_Usage",
            "irrigation": "Irrigation",
            "pestIndex": "Pest_Index"
        }
        
        numeric_cols = ["Year", "Temperature", "Humidity", "Rainfall", "N", "P", "K", "Fertilizer_Usage", "Pesticide_Usage", "Irrigation", "Pest_Index"]
        categorical_cols = ['District', 'Crop', 'Season', 'Soil_Type', 'Variety']
        
        mapped_data = {}
        # Initialize with defaults
        for col in numeric_cols:
            mapped_data[col] = 0.0
        for col in categorical_cols:
            mapped_data[col] = ""
            
        for k, v in input_data.items():
            if k in mapping:
                col_name = mapping[k]
                if col_name in numeric_cols:
                    try:
                        mapped_data[col_name] = float(v)
                    except:
                        mapped_data[col_name] = 0.0
                else:
                    mapped_data[col_name] = v
        
        df = pd.DataFrame([mapped_data])
        
        # Feature Engineering
        df = engineer_features(df)
        
        # Encoding
        categorical_cols = ['District', 'Crop', 'Season', 'Soil_Type', 'Variety']
        # Create a template DataFrame with all categorical columns to ensure get_dummies produces all expected columns
        # However, a better way is to manually create the dummy columns based on feature_cols
        
        # Initialize all feature columns to 0
        df_final = pd.DataFrame(0, index=[0], columns=feature_cols)
        
        # Fill in numeric features
        for col in df.columns:
            if col in df_final.columns:
                df_final.loc[0, col] = df.loc[0, col]
        
        # Fill in categorical features (one-hot encoding)
        for col in categorical_cols:
            if col in df.columns:
                val = df.loc[0, col]
                dummy_col = f"{col}_{val}"
                if dummy_col in df_final.columns:
                    df_final.loc[0, dummy_col] = 1
        
        # Predict
        prediction = model.predict(df_final)[0]
        
        # Output result
        print(json.dumps({
            "yield": float(prediction),
            "confidence": 92.5, # Placeholder for now
            "variance": 0.08    # Placeholder for now
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
