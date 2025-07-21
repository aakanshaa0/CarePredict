import pandas as pd
import joblib
import os
import sys
import json
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

# Configure absolute paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CANCER_DATA_PATH = os.path.join(SCRIPT_DIR, "data.csv")
CANCER_MODEL_PATH = os.path.join(SCRIPT_DIR, "cancer_model.pkl")
CANCER_SCALER_PATH = os.path.join(SCRIPT_DIR, "cancer_scaler.pkl")

def load_and_preprocess_cancer(filepath):
    """Load and preprocess cancer data with column name sanitization."""
    try:
        cancer_df = pd.read_csv(filepath)
        
        # Clean column names: remove spaces/uppercase
        cancer_df.columns = (
            cancer_df.columns.str.strip()        # Remove whitespace
            .str.replace(' ', '_')               # Replace spaces with underscores
            .str.lower()                         # Convert to lowercase
        )
        
        cancer_df['diagnosis'] = cancer_df['diagnosis'].map({'M': 1, 'B': 0})
        return cancer_df
    except FileNotFoundError:
        print(f"Error: File not found at {filepath}")
        return None

def train_cancer_model(df, model_path, scaler_path):
    """Train and save the cancer model/scaler."""
    features = [
        'radius_mean',
        'texture_mean',
        'perimeter_mean',
        'area_mean',
        'smoothness_mean',
        'compactness_mean',
        'concavity_mean',
        'concave_points_mean',  # Now matches sanitized name
        'symmetry_mean',
        'fractal_dimension_mean'
    ]
    
    X = df[features]
    y = df['diagnosis']
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_scaled, y)
    
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

def predict_cancer_risk(patient_data):
    """Predict cancer risk from patient data."""
    required_features = [
        'radius_mean',
        'texture_mean',
        'perimeter_mean',
        'area_mean',
        'smoothness_mean',
        'compactness_mean',
        'concavity_mean',
        'concave_points_mean',
        'symmetry_mean',
        'fractal_dimension_mean'
    ]
    
    # Create DataFrame with correct feature order
    input_df = pd.DataFrame([patient_data], columns=required_features)
    
    # Load scaler and model
    scaler = joblib.load(CANCER_SCALER_PATH)
    model = joblib.load(CANCER_MODEL_PATH)
    
    # Scale and predict
    scaled_input = scaler.transform(input_df)
    return model.predict_proba(scaled_input)[0][1]  # Return malignant probability

if __name__ == "__main__":
    if not sys.stdin.isatty():  # Server mode
        input_json = sys.stdin.read()
        patient_data = json.loads(input_json)
        risk = predict_cancer_risk(patient_data)
        print(f"{risk * 100:.1f}")
    else:  # Train model
        print("Training cancer model...")
        df = load_and_preprocess_cancer(CANCER_DATA_PATH)
        if df is not None:
            train_cancer_model(df, CANCER_MODEL_PATH, CANCER_SCALER_PATH)
            print(f"Model saved to {CANCER_MODEL_PATH}")
            print(f"Scaler saved to {CANCER_SCALER_PATH}")