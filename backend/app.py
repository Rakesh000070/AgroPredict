import streamlit as st
import pandas as pd
import numpy as np
import joblib

# Load model and feature columns
try:
    model = joblib.load("model.pkl")
    feature_columns = joblib.load("features.pkl")
except:
    st.error("Model files not found. Please run model.py first.")
    st.stop()

st.title("🌾 Odisha Crop Yield Prediction System")
st.markdown("Predict crop yield based on agricultural and environmental factors.")

# Sidebar for inputs
st.sidebar.header("Input Parameters")

year = st.sidebar.number_input("Year", 2000, 2030, 2023)
crop = st.sidebar.selectbox("Crop", ["Rice", "Wheat", "Pulses"])
variety = st.sidebar.selectbox("Variety", ["Variety_A", "Variety_B", "Variety_C"])
season = st.sidebar.selectbox("Season", ["Kharif", "Rabi", "Zaid"])
soil_type = st.sidebar.selectbox("Soil Type", ["Clay", "Loamy", "Sandy"])

temp = st.sidebar.slider("Temperature (°C)", 10.0, 50.0, 25.0)
humidity = st.sidebar.slider("Humidity (%)", 10.0, 100.0, 60.0)
rainfall = st.sidebar.slider("Rainfall (mm)", 0.0, 3000.0, 1000.0)

n = st.sidebar.number_input("Nitrogen (N)", 0.0, 200.0, 80.0)
p = st.sidebar.number_input("Phosphorus (P)", 0.0, 200.0, 40.0)
k = st.sidebar.number_input("Potassium (K)", 0.0, 200.0, 40.0)

fertilizer = st.sidebar.number_input("Fertilizer Usage", 0.0, 500.0, 150.0)
pesticide = st.sidebar.number_input("Pesticide Usage", 0.0, 10.0, 2.0)
irrigation = st.sidebar.number_input("Irrigation (mm)", 0.0, 2000.0, 500.0)
pest_index = st.sidebar.slider("Pest Index", 0.0, 1.0, 0.1)

if st.button("Predict Yield"):
    # Create input dataframe
    input_data = pd.DataFrame({
        'Year': [year],
        'Crop': [crop],
        'Variety': [variety],
        'Season': [season],
        'Soil_Type': [soil_type],
        'Temperature': [temp],
        'Humidity': [humidity],
        'Rainfall': [rainfall],
        'N': [n],
        'P': [p],
        'K': [k],
        'Fertilizer_Usage': [fertilizer],
        'Pesticide_Usage': [pesticide],
        'Irrigation': [irrigation],
        'Pest_Index': [pest_index]
    })

    # Feature Engineering
    input_data['NPK_sum'] = input_data['N'] + input_data['P'] + input_data['K']
    input_data['Fertility_Index'] = (input_data['N'] + input_data['P'] + input_data['K']) / 3
    input_data['Input_Intensity'] = input_data['Fertilizer_Usage'] + input_data['Pesticide_Usage']
    input_data['Stress'] = input_data['Temperature'] * input_data['Pest_Index']
    input_data['Water_Stress'] = input_data['Temperature'] / (input_data['Rainfall'] + 1)
    input_data['Water_Efficiency'] = input_data['Rainfall'] / (input_data['Irrigation'] + 1)
    input_data['Yield_Factor'] = input_data['Rainfall'] * input_data['NPK_sum']

    # One-hot encoding
    input_encoded = pd.get_dummies(input_data)
    
    # Align with training columns
    for col in feature_columns:
        if col not in input_encoded.columns:
            input_encoded[col] = 0
    
    input_encoded = input_encoded[feature_columns]

    # Prediction
    prediction = model.predict(input_encoded)[0]
    
    st.header(f"Predicted Yield: {prediction:.2f} tons/hectare")
    st.balloons()
