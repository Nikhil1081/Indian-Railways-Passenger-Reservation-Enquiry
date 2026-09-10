import os
import json
import random
import time
import asyncio
import urllib.request
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.core.config import get_settings

try:
    from groq import Groq
    HAS_GROQ = True
except ImportError:
    HAS_GROQ = False

try:
    from MultiFeatures.IndianRailway import confirmtkt
    HAS_CONFIRMTKT = True
except ImportError:
    HAS_CONFIRMTKT = False

settings = get_settings()
app = FastAPI(title=settings.app_name, version=settings.app_version)

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TRAIN_DB = {}
STATION_CODE_MAP = {} # name -> code
STATION_NAME_MAP = {} # code -> name

def build_station_maps():
    global STATION_CODE_MAP, STATION_NAME_MAP
    STATION_CODE_MAP = {}
    STATION_NAME_MAP = {}
    
    stations_path = "data/stations.json"
    stations_data = []
    if os.path.exists(stations_path):
        try:
            with open(stations_path, "r", encoding="utf-8") as f:
                stations_data = json.load(f)
        except Exception as e:
            print("Error loading stations for compilation:", e)
            
    if isinstance(stations_data, list):
        for st in stations_data:
            c = st.get("code", "").upper().strip()
            n = st.get("name", "").upper().strip()
            if c and n:
                STATION_NAME_MAP[c] = n
                STATION_CODE_MAP[n.lower()] = c
                
    for train_info in TRAIN_DB.values():
        if train_info.get("from") and train_info.get("from_name"):
            c = train_info["from"].upper().strip()
            n = train_info["from_name"].upper().strip()
            STATION_NAME_MAP[c] = n
            STATION_CODE_MAP[n.lower()] = c
        if train_info.get("to") and train_info.get("to_name"):
            c = train_info["to"].upper().strip()
            n = train_info["to_name"].upper().strip()
            STATION_NAME_MAP[c] = n
            STATION_CODE_MAP[n.lower()] = c
        for stop in train_info.get("stops", []):
            c = stop["station_code"].upper().strip()
            n = stop["station_name"].upper().strip()
            STATION_NAME_MAP[c] = n
            STATION_CODE_MAP[n.lower()] = c
            
    print(f"Station Index compilation complete. {len(STATION_NAME_MAP)} Indian Railway stations mapped.")

# Self-healing train and station database loader
def load_train_database():
    global TRAIN_DB, STATION_CODE_MAP, STATION_NAME_MAP
    processed_path = "data/processed_trains.json"
    raw_path = "data/trains.json"
    stations_path = "data/stations.json"
    
    os.makedirs("data", exist_ok=True)
    
    # 1. Load or download raw trains list
    if os.path.exists(processed_path):
        try:
            with open(processed_path, "r", encoding="utf-8") as f:
                TRAIN_DB = json.load(f)
            print(f"Loaded {len(TRAIN_DB)} cached trains from {processed_path}")
        except Exception as e:
            print(f"Failed to load processed file, rebuilding: {e}")
            
    if not TRAIN_DB:
        if not os.path.exists(raw_path):
            print("Downloading trains.json from GitHub...")
            try:
                url = "https://raw.githubusercontent.com/arunasank/indian-railways/master/data/trains.json"
                urllib.request.urlretrieve(url, raw_path)
                print("Download completed successfully!")
            except Exception as e:
                print(f"Download failed: {e}. Using minimal inline database.")
                TRAIN_DB = get_minimal_fallback_db()
                
        if not TRAIN_DB and os.path.exists(raw_path):
            try:
                print("Preprocessing raw data...")
                with open(raw_path, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    
                processed_trains = {}
                for row in raw_data:
                    train_no_dict = row.get("Train No")
                    if not train_no_dict or not isinstance(train_no_dict, dict):
                        continue
                    
                    raw_val = train_no_dict.get("")
                    if not raw_val:
                        continue
                        
                    train_no = str(raw_val).strip().replace("'", "").replace('"', "")
                    if len(train_no) < 5:
                        train_no = train_no.zfill(5)
                        
                    train_name = row.get("train Name", "Express").strip()
                    station_code = row.get("station Code", "").strip()
                    station_name = row.get("Station Name", "").strip()
                    
                    arr_time = str(row.get("Arrival time", "00:00:00")).strip().replace("'", "")
                    dept_time = str(row.get("Departure time", "00:00:00")).strip().replace("'", "")
                    
                    try:
                        distance = int(row.get("Distance", 0))
                    except:
                        distance = 0
                        
                    try:
                        seq = int(row.get("islno", 1))
                    except:
                        seq = 1
                        
                    src_code = row.get("Source Station Code", "").strip()
                    src_name = row.get("source Station Name", "").strip()
                    dst_code = row.get("Destination station Code", "").strip()
                    dst_name = row.get("Destination Station Name", "").strip()
                    
                    if train_no not in processed_trains:
                        processed_trains[train_no] = {
                            "train_no": train_no,
                            "name": train_name,
                            "from": src_code,
                            "from_name": src_name,
                            "to": dst_code,
                            "to_name": dst_name,
                            "stops": []
                        }
                        
                    processed_trains[train_no]["stops"].append({
                        "station_code": station_code,
                        "station_name": station_name,
                        "arrival": arr_time,
                        "departure": dept_time,
                        "distance_km": distance,
                        "sequence": seq
                    })
                    
                for t_no, t_info in processed_trains.items():
                    t_info["stops"].sort(key=lambda x: x["sequence"])
                    
                TRAIN_DB = processed_trains
                
                with open(processed_path, "w", encoding="utf-8") as f:
                    json.dump(processed_trains, f, indent=2)
                print(f"Processed and cached {len(TRAIN_DB)} trains successfully.")
            except Exception as e:
                print(f"Failed to preprocess: {e}. Using minimal inline database.")
                TRAIN_DB = get_minimal_fallback_db()

    # 2. Load or download comprehensive Indian Railway Stations Gist
    stations_data = []
    if os.path.exists(stations_path):
        try:
            with open(stations_path, "r", encoding="utf-8") as f:
                stations_data = json.load(f)
            print(f"Loaded {len(stations_data)} station definitions from {stations_path}")
        except Exception as e:
            print("Error loading stations database:", e)
            
    if not stations_data:
        print("Downloading comprehensive stations list from Gist...")
        try:
            url = "https://gist.githubusercontent.com/apsdehal/11393083/raw/"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as response:
                stations_data = json.loads(response.read().decode('utf-8'))
                
            with open(stations_path, "w", encoding="utf-8") as f:
                json.dump(stations_data, f, indent=2)
            print(f"Successfully downloaded and cached {len(stations_data)} stations.")
        except Exception as e:
            print("Failed to download stations list:", e)
            
    build_station_maps()

def resolve_station_code(query: str) -> str:
    query = query.upper().strip()
    if query in STATION_NAME_MAP:
        return query
        
    for name_lower, code in STATION_CODE_MAP.items():
        if query == name_lower.upper() or query in name_lower.upper():
            return code
            
    common_mappings = {
        "BENGALURU": "SBC", "BANGALORE": "SBC",
        "PUNE": "PUNE",
        "DELHI": "NDLS", "NEW DELHI": "NDLS",
        "MUMBAI": "MMCT", "BOMBAY": "MMCT",
        "KOLKATA": "HWH", "CALCUTTA": "HWH",
        "CHENNAI": "MAS", "MADRAS": "MAS",
        "HYDERABAD": "SC", "SECUNDERABAD": "SC",
        "PATNA": "PNBE", "YESVANTPUR": "YPR", "YELAHANKA": "YNK",
        "HOWRAH": "HWH", "H NIZAMUDDIN": "NZM", "NIZAMUDDIN": "NZM"
    }
    for k, v in common_mappings.items():
        if k in query:
            return v
            
    return query

def get_station_name_fallback(code: str) -> str:
    return STATION_NAME_MAP.get(code.upper().strip(), code)

def get_minimal_fallback_db():
    fallback = {
        "12952": {
            "train_no": "12952", "name": "Mumbai Rajdhani Express", "from": "NDLS", "from_name": "New Delhi", "to": "MMCT", "to_name": "Mumbai Central",
            "stops": [
                {"station_code": "NDLS", "station_name": "New Delhi", "arrival": "Source", "departure": "16:55:00", "distance_km": 0, "sequence": 1},
                {"station_code": "KOTA", "station_name": "Kota Junction", "arrival": "22:15:00", "departure": "22:20:00", "distance_km": 465, "sequence": 2},
                {"station_code": "RTM", "station_name": "Ratlam Junction", "arrival": "01:30:00", "departure": "01:33:00", "distance_km": 732, "sequence": 3},
                {"station_code": "BRC", "station_name": "Vadodara Junction", "arrival": "04:40:00", "departure": "04:48:00", "distance_km": 992, "sequence": 4},
                {"station_code": "BVI", "station_name": "Borivali", "arrival": "07:40:00", "departure": "07:42:00", "distance_km": 1356, "sequence": 5},
                {"station_code": "MMCT", "station_name": "Mumbai Central", "arrival": "08:35:00", "departure": "Destination", "distance_km": 1386, "sequence": 6}
            ]
        },
        "12301": {
            "train_no": "12301", "name": "Howrah Rajdhani Express", "from": "HWH", "from_name": "Howrah", "to": "NDLS", "to_name": "New Delhi",
            "stops": [
                {"station_code": "HWH", "station_name": "Howrah Junction", "arrival": "Source", "departure": "16:50:00", "distance_km": 0, "sequence": 1},
                {"station_code": "ASN", "station_name": "Asansol Junction", "arrival": "18:57:00", "departure": "18:59:00", "distance_km": 200, "sequence": 2},
                {"station_code": "DHN", "station_name": "Dhanbad Junction", "arrival": "19:55:00", "departure": "20:00:00", "distance_km": 259, "sequence": 3},
                {"station_code": "GAYA", "station_name": "Gaya Junction", "arrival": "22:31:00", "departure": "22:34:00", "distance_km": 459, "sequence": 4},
                {"station_code": "DDU", "station_name": "Pt Deen Dayal Upadhyaya", "arrival": "00:45:00", "departure": "00:55:00", "distance_km": 661, "sequence": 5},
                {"station_code": "PRYJ", "station_name": "Prayagraj Junction", "arrival": "02:43:00", "departure": "02:45:00", "distance_km": 813, "sequence": 6},
                {"station_code": "CNB", "station_name": "Kanpur Central", "arrival": "04:50:00", "departure": "04:55:00", "distance_km": 1007, "sequence": 7},
                {"station_code": "NDLS", "station_name": "New Delhi", "arrival": "09:55:00", "departure": "Destination", "distance_km": 1447, "sequence": 8}
            ]
        }
    }
    return fallback

# Load DB on startup
load_train_database()

# PNR Database
MOCK_PNRS = {
    "1234567890": {
        "pnr": "1234567890",
        "train_no": "12952",
        "train_name": "Mumbai Rajdhani Express",
        "date_of_journey": "2026-08-15",
        "from": "NDLS",
        "to": "MMCT",
        "class": "3A",
        "quota": "GN",
        "chart_status": "CHART PREPARED",
        "passengers": [
            {"name": "Rajesh Kumar", "age": 42, "gender": "M", "booking_status": "CNF / A1 / 12 (Lower)", "current_status": "CNF / A1 / 12"},
            {"name": "Sunita Devi", "age": 39, "gender": "F", "booking_status": "CNF / A1 / 14 (Side Lower)", "current_status": "CNF / A1 / 14"}
        ]
    },
    "9876543210": {
        "pnr": "9876543210",
        "train_no": "12301",
        "train_name": "Howrah Rajdhani Express",
        "date_of_journey": "2026-08-20",
        "from": "HWH",
        "to": "NDLS",
        "class": "2A",
        "quota": "GN",
        "chart_status": "CHART NOT PREPARED",
        "passengers": [
            {"name": "Amit Patel", "age": 28, "gender": "M", "booking_status": "WL 14 / WL 5", "current_status": "WL 2"},
            {"name": "Neha Patel", "age": 26, "gender": "F", "booking_status": "WL 15 / WL 6", "current_status": "WL 3"}
        ]
    },
    "1122334455": {
        "pnr": "1122334455",
        "train_no": "22626",
        "train_name": "Double Decker Express",
        "date_of_journey": "2026-08-10",
        "from": "SBC",
        "to": "MAS",
        "class": "CC",
        "quota": "TQ",
        "chart_status": "CHART PREPARED",
        "passengers": [
            {"name": "Vikram Singh", "age": 31, "gender": "M", "booking_status": "CNF / C2 / 48 (Window)", "current_status": "CNF / C2 / 48"}
        ]
    }
}

class ChatPayload(BaseModel):
    message: str
    history: list = []

# Fare Calculator Logic (Offline Fallback)
def calculate_fare_details(distance_km: int, class_code: str, is_premier: bool):
    if distance_km <= 300:
        rates = {"1A": 6.8, "EC": 7.2, "2A": 4.5, "3A": 3.2, "CC": 3.0, "SL": 1.6, "2S": 0.8}
    elif distance_km <= 1000:
        rates = {"1A": 6.0, "EC": 6.4, "2A": 4.0, "3A": 2.8, "CC": 2.6, "SL": 1.4, "2S": 0.7}
    else:
        rates = {"1A": 5.4, "EC": 5.8, "2A": 3.6, "3A": 2.5, "CC": 2.3, "SL": 1.2, "2S": 0.6}
        
    rate = rates.get(class_code, 1.2)
    base_fare = int(distance_km * rate)
    
    if is_premier:
        base_fare = int(base_fare * 1.35)
        
    res_charges = {"1A": 60, "EC": 60, "2A": 50, "3A": 40, "CC": 40, "SL": 20, "2S": 15}
    res_fee = res_charges.get(class_code, 20)
    
    sf_charges = {"1A": 75, "EC": 75, "2A": 45, "3A": 45, "CC": 45, "SL": 30, "2S": 15}
    sf_fee = sf_charges.get(class_code, 30)
    
    catering_fee = 0
    if is_premier:
        if class_code in ["1A", "EC"]:
            catering_fee = 380
        elif class_code in ["2A", "3A", "CC"]:
            catering_fee = 240
            
    is_ac = class_code in ["1A", "2A", "3A", "CC", "EC"]
    subtotal = base_fare + res_fee + sf_fee + catering_fee
    gst = int(subtotal * 0.05) if is_ac else 0
    
    total = subtotal + gst
    
    return {
        "distance_km": distance_km,
        "base_fare": base_fare,
        "reservation_fee": res_fee,
        "superfast_fee": sf_fee,
        "catering_fee": catering_fee,
        "gst": gst,
        "total_fare": total
    }

# Dynamic PNR generator
def generate_pnr_data(pnr: str):
    if not pnr.isdigit() or len(pnr) != 10:
        raise ValueError("Invalid PNR format")
    
    seed_val = int(pnr)
    random.seed(seed_val)
    
    train_keys = list(TRAIN_DB.keys())
    train_no = random.choice(train_keys)
    train_info = TRAIN_DB[train_no]
    
    days_ahead = random.randint(1, 30)
    journey_date = (datetime.now() + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
    
    classes = ["1A", "2A", "3A", "SL"]
    class_choice = random.choice(classes)
    quota_choice = random.choice(["GN", "TQ", "LD"])
    chart_prep = random.choice(["CHART PREPARED", "CHART NOT PREPARED"])
    
    first_names = ["Rahul", "Anjali", "Suresh", "Meena", "Rohan", "Kirti", "Arjun", "Pooja", "Vijay", "Aisha"]
    last_names = ["Sharma", "Verma", "Gupta", "Mishra", "Joshi", "Rao", "Nair", "Reddy", "Mehta", "Sen"]
    
    num_passengers = random.randint(1, 3)
    passengers = []
    
    for i in range(num_passengers):
        p_name = f"{random.choice(first_names)} {random.choice(last_names)}"
        p_age = random.randint(18, 70)
        p_gender = random.choice(["M", "F"])
        
        status_roll = random.random()
        if status_roll > 0.3:
            coach = "A1" if class_choice == "2A" else ("B1" if class_choice == "3A" else ("H1" if class_choice == "1A" else "S1"))
            berth_no = random.randint(1, 64)
            berth_type = random.choice(["Lower", "Middle", "Upper", "Side Lower", "Side Upper"])
            booking_status = f"CNF / {coach} / {berth_no} ({berth_type})"
            current_status = f"CNF / {coach} / {berth_no}"
        else:
            wl_booking = random.randint(10, 40)
            wl_current = wl_booking - random.randint(5, 10)
            if wl_current <= 0:
                booking_status = f"WL {wl_booking}"
                current_status = f"RAC {random.randint(1, 5)}"
            else:
                booking_status = f"WL {wl_booking}"
                current_status = f"WL {wl_current}"
                
        passengers.append({
            "name": p_name,
            "age": p_age,
            "gender": p_gender,
            "booking_status": booking_status,
            "current_status": current_status
        })
        
    return {
        "pnr": pnr,
        "train_no": train_no,
        "train_name": train_info["name"],
        "date_of_journey": journey_date,
        "from": train_info["from"],
        "to": train_info["to"],
        "class": class_choice,
        "quota": quota_choice,
        "chart_status": chart_prep,
        "passengers": passengers
    }

# API Endpoints

# 1. PNR checking (falls back to local OR confirmtkt live pnr info)
@app.get("/api/pnr/{pnr}")
async def check_pnr(pnr: str):
    if not pnr.isdigit() or len(pnr) != 10:
        raise HTTPException(status_code=400, detail="PNR must be a 10-digit number.")
        
    if HAS_CONFIRMTKT:
        try:
            cf = confirmtkt.Confirmtkt()
            live_res = await cf.pnr_info(int(pnr))
            if live_res and not live_res.get("error") and live_res.get("TrainNo"):
                passengers = []
                for p in live_res.get("PassengerStatus", []):
                    passengers.append({
                        "name": p.get("PassengerName", f"Passenger {p.get('Number')}"),
                        "age": p.get("Age", 30),
                        "gender": p.get("Gender", "M"),
                        "booking_status": p.get("BookingStatusDisplayName", "N/A"),
                        "current_status": p.get("CurrentStatusDisplayName", "N/A")
                    })
                    
                return {
                    "pnr": pnr,
                    "train_no": live_res.get("TrainNo"),
                    "train_name": live_res.get("TrainName"),
                    "date_of_journey": live_res.get("Doj"),
                    "from": live_res.get("From"),
                    "to": live_res.get("To"),
                    "class": live_res.get("Class"),
                    "quota": live_res.get("Quota"),
                    "chart_status": "CHART PREPARED" if live_res.get("ChartPrepared") else "CHART NOT PREPARED",
                    "passengers": passengers
                }
        except Exception as e:
            print("ConfirmTkt PNR fetch failed, falling back to dynamic generator:", e)

    if pnr in MOCK_PNRS:
        return MOCK_PNRS[pnr]
    try:
        return generate_pnr_data(pnr)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid PNR.")

# 2. Search trains between stations (fetches live IRCTC data)
@app.get("/api/trains/search")
async def search_trains(source: str = Query(...), destination: str = Query(...)):
    # Resolve station names to codes
    resolved_src = resolve_station_code(source)
    resolved_dst = resolve_station_code(destination)
    
    if HAS_CONFIRMTKT:
        try:
            cf = confirmtkt.Confirmtkt()
            tomorrow = (datetime.now() + timedelta(days=1)).strftime("%d-%m-%Y")
            live_res = await cf.available_trains(src=resolved_src, dest=resolved_dst, doj=tomorrow)
            
            if live_res and "trainBtwnStnsList" in live_res:
                live_trains = live_res["trainBtwnStnsList"]
                results = []
                
                for t in live_trains:
                    train_no = str(t.get("trainNumber", ""))
                    if len(train_no) < 5:
                        train_no = train_no.zfill(5)
                        
                    is_p = t.get("trainType", "EXP") in ["RAJ", "SHT", "VB", "DUR"] or "RAJDHANI" in t.get("trainName", "").upper() or "VANDE BHARAT" in t.get("trainName", "").upper() or "SHATABDI" in t.get("trainName", "").upper()
                    classes = t.get("avlClasses", {}).get("Array", ["3A", "2A", "SL"])
                    
                    results.append({
                        "train_no": train_no,
                        "name": t.get("trainName", "Express"),
                        "from": resolved_src,
                        "to": resolved_dst,
                        "from_name": t.get("fromStnName", get_station_name_fallback(resolved_src)),
                        "to_name": t.get("toStnName", get_station_name_fallback(resolved_dst)),
                        "runs": ["Mon" if t.get(f"running{day}") else "" for day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]],
                        "classes": classes,
                        "distance_km": t.get("distance", 350),
                        "is_premier": is_p,
                        "route": [t.get("fromStnCode", resolved_src), t.get("toStnCode", resolved_dst)]
                    })
                
                for r in results:
                    r["runs"] = [day for day in r["runs"] if day]
                    if not r["runs"]:
                        r["runs"] = ["Daily"]
                        
                if results:
                    return results
        except Exception as e:
            print("ConfirmTkt live search failed, falling back to local DB:", e)
            
    # Fallback to local processed trains JSON
    results = []
    for train_no, train_info in TRAIN_DB.items():
        stops = train_info["stops"]
        station_codes = [s["station_code"] for s in stops]
        if resolved_src in station_codes and resolved_dst in station_codes:
            s_idx = station_codes.index(resolved_src)
            d_idx = station_codes.index(resolved_dst)
            if s_idx < d_idx:
                distance = stops[d_idx]["distance_km"] - stops[s_idx]["distance_km"]
                is_p = "RAJDHANI" in train_info["name"].upper() or "VANDE BHARAT" in train_info["name"].upper() or "SHATABDI" in train_info["name"].upper()
                
                results.append({
                    "train_no": train_no,
                    "name": train_info["name"],
                    "from": resolved_src,
                    "to": resolved_dst,
                    "from_name": get_station_name_fallback(resolved_src),
                    "to_name": get_station_name_fallback(resolved_dst),
                    "runs": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                    "classes": ["1A", "2A", "3A"] if is_p and "SHATABDI" not in train_info["name"].upper() else (["EC", "CC"] if "VANDE BHARAT" in train_info["name"].upper() or "SHATABDI" in train_info["name"].upper() else ["2A", "3A", "SL", "2S"]),
                    "distance_km": distance,
                    "is_premier": is_p,
                    "route": [s["station_code"] for s in stops[s_idx:d_idx+1]]
                })
                
    return results[:80]

# 3. Intermediate Schedule Stops
@app.get("/api/trains/schedule/{train_no}")
async def get_schedule(train_no: str):
    t_no = train_no.strip()
    if len(t_no) < 5:
        t_no = t_no.zfill(5)
        
    if HAS_CONFIRMTKT:
        try:
            cf = confirmtkt.Confirmtkt()
            today_str = datetime.now().strftime("%d-%m-%Y")
            live_sched = await cf.train_schedule(train_no=int(t_no), date=today_str)
            
            if live_sched and "Schedule" in live_sched:
                live_stops = live_sched["Schedule"]
                stops_data = []
                
                for idx, s in enumerate(live_stops):
                    arr = s.get("ArrivalTime") or "Source"
                    dep = s.get("DepartureTime") or "Destination"
                    if idx == 0:
                        arr = "Source"
                    if idx == len(live_stops) - 1:
                        dep = "Destination"
                        
                    try:
                        dist = int(float(s.get("Distance", 0)))
                    except:
                        dist = 0
                        
                    halt_minutes = 0
                    try:
                        halt_val = s.get("HaltMinutes")
                        if halt_val and str(halt_val).isdigit():
                            halt_minutes = int(halt_val)
                        elif arr != "Source" and dep != "Destination":
                            arr_t = datetime.strptime(arr, "%H:%M")
                            dep_t = datetime.strptime(dep, "%H:%M")
                            diff = (dep_t - arr_t).seconds // 60
                            halt_minutes = diff if diff < 120 else 2
                    except:
                        halt_minutes = 2 if arr != "Source" and dep != "Destination" else 0
                        
                    stops_data.append({
                        "station_code": s.get("StationCode", "").upper().strip(),
                        "station_name": s.get("StationName", "").strip(),
                        "arrival": arr,
                        "departure": dep,
                        "halt_minutes": halt_minutes,
                        "distance_km": dist,
                        "sequence": s.get("StopNumber") or (idx + 1)
                    })
                
                if stops_data:
                    stops_data.sort(key=lambda x: x["sequence"])
                    
                    TRAIN_DB[t_no] = {
                        "train_no": t_no,
                        "name": live_sched.get("TrainName", "Express"),
                        "from": live_sched.get("SourceCode") or stops_data[0]["station_code"],
                        "from_name": live_sched.get("Source") or stops_data[0]["station_name"],
                        "to": live_sched.get("DestinationCode") or stops_data[-1]["station_code"],
                        "to_name": live_sched.get("Destination") or stops_data[-1]["station_name"],
                        "stops": stops_data
                    }
                    
                    try:
                        with open("data/processed_trains.json", "w", encoding="utf-8") as f:
                            json.dump(TRAIN_DB, f, indent=2)
                        build_station_maps()
                    except Exception as e:
                        print("Error caching train schedule to disk:", e)
                        
                    return {
                        "train_no": t_no,
                        "name": TRAIN_DB[t_no]["name"],
                        "schedule": stops_data
                    }
        except Exception as e:
            print(f"ConfirmTkt live schedule fetch failed for {t_no}, falling back to local DB: {e}")
            
    if t_no not in TRAIN_DB:
        raise HTTPException(status_code=404, detail="Train schedule not found.")
    
    train_info = TRAIN_DB[t_no]
    schedule_data = []
    
    for s in train_info["stops"]:
        schedule_data.append({
            "station_code": s["station_code"],
            "station_name": s["station_name"],
            "arrival": s["arrival"],
            "departure": s["departure"],
            "halt_minutes": 0 if s["arrival"] == "Source" or s["departure"] == "Destination" else random.randint(2, 10),
            "distance_km": s["distance_km"]
        })
        
    return {
        "train_no": t_no,
        "name": train_info["name"],
        "schedule": schedule_data
    }

# 3.1 Live Train Status Tracking
@app.get("/api/trains/live/{train_no}")
async def get_live_train_status(train_no: str, date: str = Query("today")):
    t_no = train_no.strip()
    if len(t_no) < 5:
        t_no = t_no.zfill(5)
        
    now = datetime.now()
    if date.lower() == "today":
        doj_str = now.strftime("%d-%m-%Y")
        doj_iso = now.strftime("%Y-%m-%d")
    elif date.lower() == "yesterday":
        yest = now - timedelta(days=1)
        doj_str = yest.strftime("%d-%m-%Y")
        doj_iso = yest.strftime("%Y-%m-%d")
    else:
        try:
            if "-" in date:
                parts = date.split("-")
                if len(parts[0]) == 4:
                    dt = datetime.strptime(date, "%Y-%m-%d")
                else:
                    dt = datetime.strptime(date, "%d-%m-%Y")
                doj_str = dt.strftime("%d-%m-%Y")
                doj_iso = dt.strftime("%Y-%m-%d")
            else:
                doj_str = now.strftime("%d-%m-%Y")
                doj_iso = now.strftime("%Y-%m-%d")
        except:
            doj_str = now.strftime("%d-%m-%Y")
            doj_iso = now.strftime("%Y-%m-%d")

    # Try ConfirmTkt live status
    if HAS_CONFIRMTKT:
        try:
            cf = confirmtkt.Confirmtkt()
            live_res = await cf.live_train_status(t_no, doj_str)
            if live_res and isinstance(live_res, dict) and not live_res.get("Error") and live_res.get("trainDataFound") == "trainRunningDataFound":
                stations = live_res.get("stations", [])
                formatted_stations = []
                cur_stn_code = (live_res.get("curStn") or "").upper().strip()
                cur_stn_name = (live_res.get("curStnName") or "").strip()
                is_terminated = bool(live_res.get("terminated"))
                is_departed = bool(live_res.get("departed"))
                total_delay = live_res.get("totalLateMins") or 0
                
                for idx, s in enumerate(stations):
                    code = s.get("stnCode", "").upper().strip()
                    name = s.get("stnCodeName", "").strip() or get_station_name_fallback(code)
                    sch_arr = s.get("schArrTime") or "--"
                    sch_dep = s.get("schDepTime") or "--"
                    act_arr = s.get("actArr") or sch_arr
                    act_dep = s.get("actDep") or sch_dep
                    delay_arr = s.get("delayArr", 0)
                    delay_dep = s.get("delayDep", 0)
                    has_arrived = bool(s.get("arr"))
                    has_departed = bool(s.get("dep"))
                    platform = str(s.get("ExpectedPlatformNo") or s.get("pfNo") or "-")
                    if platform == "0":
                        platform = "-"
                    distance = s.get("distance", 0)
                    halt = s.get("haltMinutes", 0)
                    
                    is_current = (code == cur_stn_code) or (not has_departed and has_arrived)
                    
                    formatted_stations.append({
                        "station_code": code,
                        "station_name": name,
                        "scheduled_arrival": sch_arr,
                        "scheduled_departure": sch_dep,
                        "actual_arrival": act_arr,
                        "actual_departure": act_dep,
                        "delay_arrival_mins": delay_arr,
                        "delay_departure_mins": delay_dep,
                        "has_arrived": has_arrived,
                        "has_departed": has_departed,
                        "is_current": is_current,
                        "platform": platform,
                        "distance_km": distance,
                        "halt_minutes": halt
                    })
                
                train_name = live_res.get("trainName")
                if not train_name and t_no in TRAIN_DB:
                    train_name = TRAIN_DB[t_no]["name"]
                if not train_name:
                    train_name = f"Express ({t_no})"

                last_updated = live_res.get("lastUpdated") or "Live from Indian Railways NTES"
                
                return {
                    "train_no": t_no,
                    "train_name": train_name,
                    "date": doj_iso,
                    "current_station_code": cur_stn_code,
                    "current_station_name": cur_stn_name,
                    "is_terminated": is_terminated,
                    "is_departed": is_departed,
                    "delay_minutes": total_delay,
                    "last_updated": last_updated,
                    "stations": formatted_stations,
                    "source": "live"
                }
        except Exception as e:
            print(f"Live status fetch failed for {t_no}: {e}")

    # Fallback to simulated live status along TRAIN_DB
    if t_no not in TRAIN_DB:
        try:
            if HAS_CONFIRMTKT:
                cf = confirmtkt.Confirmtkt()
                live_sched = await cf.train_schedule(train_no=int(t_no), date=doj_str)
                if live_sched and "Schedule" in live_sched:
                    stops_data = []
                    for idx, s in enumerate(live_sched["Schedule"]):
                        stops_data.append({
                            "station_code": s.get("StationCode", "").upper().strip(),
                            "station_name": s.get("StationName", "").strip(),
                            "arrival": s.get("ArrivalTime") or "Source",
                            "departure": s.get("DepartureTime") or "Destination",
                            "halt_minutes": 2,
                            "distance_km": int(float(s.get("Distance", 0))),
                            "sequence": idx + 1
                        })
                    if stops_data:
                        TRAIN_DB[t_no] = {
                            "train_no": t_no,
                            "name": live_sched.get("TrainName", "Express"),
                            "from": stops_data[0]["station_code"],
                            "from_name": stops_data[0]["station_name"],
                            "to": stops_data[-1]["station_code"],
                            "to_name": stops_data[-1]["station_name"],
                            "stops": stops_data
                        }
        except Exception as e:
            print(f"Train schedule fetch fallback error for live: {e}")

    if t_no in TRAIN_DB:
        train_info = TRAIN_DB[t_no]
        stops = train_info.get("stops", [])
        if stops:
            total_stops = len(stops)
            cur_idx = min(int((now.minute % total_stops)), total_stops - 1)
            cur_stop = stops[cur_idx]
            is_term = (cur_idx == total_stops - 1)
            sim_delay = (now.minute % 18)
            
            simulated_stations = []
            for idx, s in enumerate(stops):
                code = s["station_code"]
                name = s["station_name"]
                sch_arr = s["arrival"]
                sch_dep = s["departure"]
                has_arr = idx <= cur_idx
                has_dep = idx < cur_idx
                is_cur = (idx == cur_idx)
                
                simulated_stations.append({
                    "station_code": code,
                    "station_name": name,
                    "scheduled_arrival": sch_arr,
                    "scheduled_departure": sch_dep,
                    "actual_arrival": sch_arr,
                    "actual_departure": sch_dep,
                    "delay_arrival_mins": sim_delay if has_arr else 0,
                    "delay_departure_mins": sim_delay if has_dep else 0,
                    "has_arrived": has_arr,
                    "has_departed": has_dep,
                    "is_current": is_cur,
                    "platform": f"{(idx % 4) + 1}",
                    "distance_km": s.get("distance_km", 0),
                    "halt_minutes": 2
                })
                
            return {
                "train_no": t_no,
                "train_name": train_info["name"],
                "date": doj_iso,
                "current_station_code": cur_stop["station_code"],
                "current_station_name": cur_stop["station_name"],
                "is_terminated": is_term,
                "is_departed": True,
                "delay_minutes": sim_delay,
                "last_updated": f"Updated at {now.strftime('%I:%M %p')} (Simulated Feed)",
                "stations": simulated_stations,
                "source": "simulated"
            }

    raise HTTPException(status_code=404, detail="Live train status not found.")


# Helper to fetch search details asynchronously
async def async_fetch_date_search(cf, src, dest, date_str, quota):
    try:
        res = await cf.available_trains(src=src, dest=dest, doj=date_str, quota=quota)
        return date_str, res
    except Exception as e:
        print(f"Async date search fetch failed for {date_str}: {e}")
        return date_str, None

# 4. Check seat availability & pricing concurrently (fetching 7-day live data)
@app.get("/api/trains/seats")
async def check_seat_availability(
    train_no: str = Query(...), 
    source: str = Query(...), 
    destination: str = Query(...), 
    date: str = Query(...), 
    class_code: str = Query(...), 
    quota: str = Query("GN")
):
    t_no = train_no.strip()
    if len(t_no) < 5:
        t_no = t_no.zfill(5)
        
    start_dt = datetime.strptime(date, "%Y-%m-%d")
    
    # Resolve station names to codes
    resolved_src = resolve_station_code(source)
    resolved_dst = resolve_station_code(destination)
    
    if HAS_CONFIRMTKT:
        try:
            cf = confirmtkt.Confirmtkt()
            dates_to_fetch = [(start_dt + timedelta(days=i)).strftime("%d-%m-%Y") for i in range(7)]
            tasks = [async_fetch_date_search(cf, resolved_src, resolved_dst, d, quota) for d in dates_to_fetch]
            fetch_results = await asyncio.gather(*tasks)
            
            availability_list = []
            train_name = "Express"
            fare_info = None
            
            for date_str, res in fetch_results:
                back_dt = datetime.strptime(date_str, "%d-%m-%Y")
                back_date_str = back_dt.strftime("%Y-%m-%d")
                
                if res and "trainBtwnStnsList" in res:
                    train_match = next((t for t in res["trainBtwnStnsList"] if str(t.get("trainNumber", "")).zfill(5) == t_no), None)
                    if train_match:
                        train_name = train_match.get("trainName", "Express")
                        cache = train_match.get("avaiblitycache", {})
                        class_info = cache.get(class_code)
                        if not class_info:
                            class_info = next((cache[c] for c in cache if cache[c]), {})
                            
                        if class_info:
                            status_val = class_info.get("AvailabilityDisplayName", "AVAILABLE")
                            status_details = class_info.get("Availability", "AVAILABLE")
                            fare_val = class_info.get("Fare", "0")
                            
                            prob = 1.0
                            pred = class_info.get("PredictionDisplayName", "")
                            if "%" in pred:
                                try:
                                    prob = float(pred.replace("%", "").replace("Chance", "").strip()) / 100.0
                                except:
                                    prob = 0.8
                                    
                            availability_list.append({
                                "date": back_date_str,
                                "status": f"{status_details}",
                                "confirm_probability": prob
                            })
                            
                            if fare_val and fare_val != "0" and not fare_info:
                                total_fare = int(fare_val)
                                base = int(total_fare * 0.85)
                                gst = int(total_fare * 0.05) if class_code in ["1A", "2A", "3A", "CC", "EC"] else 0
                                sf = 30
                                res_fee = 20
                                catering = total_fare - base - gst - sf - res_fee
                                if catering < 0:
                                    catering = 0
                                    base = total_fare - gst - sf - res_fee
                                    
                                distance = train_match.get("distance", 450)
                                
                                fare_info = {
                                    "distance_km": distance,
                                    "base_fare": base,
                                    "reservation_fee": res_fee,
                                    "superfast_fee": sf,
                                    "catering_fee": catering,
                                    "gst": gst,
                                    "total_fare": total_fare
                                }
                                
            if availability_list:
                return {
                    "train_no": t_no,
                    "train_name": train_name,
                    "class_code": class_code,
                    "quota": quota,
                    "fare": fare_info,
                    "availability": availability_list
                }
        except Exception as e:
            print("ConfirmTkt live availability check failed, falling back to local simulation:", e)
            
    # Fallback to local precalculated database and simulation
    if t_no not in TRAIN_DB:
        raise HTTPException(status_code=404, detail="Train not found.")
        
    train_info = TRAIN_DB[t_no]
    stops = train_info["stops"]
    station_codes = [s["station_code"] for s in stops]
    
    if resolved_src in station_codes and resolved_dst in station_codes:
        s_idx = station_codes.index(resolved_src)
        d_idx = station_codes.index(resolved_dst)
        distance = stops[d_idx]["distance_km"] - stops[s_idx]["distance_km"]
        if distance <= 0:
            distance = 150
    else:
        distance = 450
        
    is_p = "RAJDHANI" in train_info["name"].upper() or "VANDE BHARAT" in train_info["name"].upper() or "SHATABDI" in train_info["name"].upper()
    fare_info = calculate_fare_details(distance, class_code, is_p)
    
    availability_list = []
    for i in range(7):
        current_date = start_dt + timedelta(days=i)
        date_str = current_date.strftime("%Y-%m-%d")
        
        query_hash = abs(hash(f"{t_no}-{resolved_src}-{resolved_dst}-{date_str}-{class_code}-{quota}"))
        random.seed(query_hash)
        
        roll = random.random()
        if roll > 0.5:
            seats_left = random.randint(5, 120)
            status = f"AVAILABLE - {seats_left:04d}"
            probability = 1.0
        elif roll > 0.2:
            wl_count = random.randint(1, 25)
            wl_booking = wl_count + random.randint(1, 10)
            status = f"WL {wl_booking} / WL {wl_count}"
            probability = round(random.uniform(0.4, 0.85), 2)
        else:
            rac_count = random.randint(1, 10)
            status = f"RAC {rac_count}"
            probability = 0.9
            
        availability_list.append({
            "date": date_str,
            "status": status,
            "confirm_probability": probability
        })
        
    return {
        "train_no": t_no,
        "train_name": train_info["name"],
        "class_code": class_code,
        "quota": quota,
        "fare": fare_info,
        "availability": availability_list
    }

# AI Chatbot using Groq
SYSTEM_PROMPT = """
You are "RailAI", a highly responsive, helpful, and polite AI chatbot for the Indian Railways Passenger Reservation Enquiry.
Your primary role is to assist passengers in planning journeys, explaining rules (Refund Rules, Tatkal Schemes, Concessions, Name changes), finding trains, and looking up mock PNR details.

Key Indian Railways Rules to know:
1. Tatkal Bookings: Starts at 10:00 AM daily for AC classes, and 11:00 AM for non-AC classes, one day in advance of the actual journey date.
2. Refund Policies:
   - Cancelled > 48 hours before departure: Flat fee of Rs. 240 (1A/AC Executive), Rs. 200 (2A), Rs. 180 (3A/CC), Rs. 120 (SL), Rs. 60 (2S).
   - Cancelled 12-48 hours before: 25% of ticket fare subject to flat minimum charges.
   - Cancelled 4-12 hours before: 50% of fare.
   - Cancelled < 4 hours (or chart prepared): No refund on confirmed tickets.

You have access to a real database of 2,800+ trains. If a user asks for route details or schedules, search details or ask them to check the "Train Schedule" or "Find Trains" tab.
Respond in a very neat, clean, and friendly conversational manner using Markdown formatting. Format tables and bullet points nicely! Keep responses concise and fast.
"""

def generate_local_mock_response(message: str) -> str:
    message = message.lower().strip()
    
    if "pnr" in message:
        import re
        pnr_match = re.search(r"\b\d{10}\b", message)
        if pnr_match:
            pnr_num = pnr_match.group(0)
            if pnr_num in MOCK_PNRS:
                pnr_data = MOCK_PNRS[pnr_num]
            else:
                pnr_data = generate_pnr_data(pnr_num)
            
            pax_details = "\n".join([f"- **{p['name']}**: Booking: {p['booking_status']} | Current: {p['current_status']}" for p in pnr_data['passengers']])
            return f"### PNR Status for {pnr_num}\n" \
                   f"**Train**: {pnr_data['train_no']} - {pnr_data['train_name']}\n" \
                   f"**Date of Journey**: {pnr_data['date_of_journey']}\n" \
                   f"**Route**: {pnr_data['from']} to {pnr_data['to']}\n" \
                   f"**Chart Status**: {pnr_data['chart_status']}\n\n" \
                   f"**Passenger Status details**:\n{pax_details}\n\n" \
                   f"Is there anything else I can help you with regarding this booking?"
        else:
            return "Please provide a valid **10-digit PNR number** (e.g. `1234567890`) and I will fetch the booking details for you."
            
    if "tatkal" in message:
        return "### Tatkal Booking Guidelines\n" \
               "- **Timings**: \n" \
               "  - **AC Classes**: Opens at **10:00 AM** daily for the next day's journey.\n" \
               "  - **Non-AC Classes**: Opens at **11:00 AM** daily for the next day's journey.\n" \
               "- **Refunds**: No refund is granted on the cancellation of confirmed Tatkal tickets.\n" \
               "- **Identity Proof**: One of the passengers must carry a valid original ID card listed during booking."

    if "refund" in message:
        return "### Ticket Cancellation & Refund Rules\n" \
               "Refund charges on Confirmed Tickets depend on the time of cancellation:\n" \
               "1. **More than 48 hours** before scheduled departure:\n" \
               "   - **1A / Executive Class**: Rs. 240\n" \
               "   - **2A / First Class**: Rs. 200\n" \
               "   - **3A / CC / 3E**: Rs. 180\n" \
               "   - **Sleeper Class (SL)**: Rs. 120\n" \
               "   - **Second Seating (2S)**: Rs. 60\n" \
               "2. **Between 12 hours and 48 hours**: 25% of the total ticket fare.\n" \
               "3. **Between 4 hours and 12 hours**: 50% of the total ticket fare.\n" \
               "4. **Less than 4 hours (or chart preparation)**: **No refund** is allowed on confirmed tickets.\n\n" \
               "For WL (Waitlisted) or RAC tickets, a flat clerkage charge of Rs. 60 (+GST) is deducted if cancelled up to 30 mins before train departure."

    if "train" in message or "schedule" in message or "find" in message or "search" in message:
        return "### Train Routes & Schedules\n" \
               "I can help you search for trains! We serve **2,800+ real routes**.\n" \
               "You can check routes and timetables directly in the **Find Trains** or **Train Schedule** tab on the main dashboard for precise details!"
               
    return "Hello! I am **RailAI**, your Indian Railways assistant. How can I help you today? You can ask me about:\n" \
           "- checking your ticket status (e.g. \"check PNR 1234567890\")\n" \
           "- cancellation refund rates (\"what are the refund rules?\")\n" \
           "- Tatkal ticket booking times (\"when does Tatkal open?\")\n" \
           "- train routes and station list."

async def stream_groq_response(message: str, history: list):
    try:
        client = Groq(api_key=settings.groq_api_key)
        
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for h in history[-6:]:
            messages.append({"role": h["role"], "content": h["content"]})
            
        messages.append({"role": "user", "content": message})
        
        completion = client.chat.completions.create(
            model="llama-3.3-70b-specdec",
            messages=messages,
            stream=True,
            temperature=0.7,
            max_tokens=800
        )
        
        for chunk in completion:
            content = chunk.choices[0].delta.content
            if content:
                yield content
                await asyncio.sleep(0.01)
    except Exception as e:
        print(f"Groq API Error: {e}. Falling back to local responder.")
        fallback_txt = generate_local_mock_response(message)
        words = fallback_txt.split(" ")
        for word in words:
            yield word + " "
            await asyncio.sleep(0.05)

async def stream_local_response(message: str):
    response_txt = generate_local_mock_response(message)
    words = response_txt.split(" ")
    for word in words:
        yield word + " "
        await asyncio.sleep(0.04)

@app.post("/api/chat")
async def chat_bot(payload: ChatPayload):
    try:
        if HAS_GROQ and settings.groq_api_key:
            return StreamingResponse(stream_groq_response(payload.message, payload.history), media_type="text/event-stream")
        else:
            return StreamingResponse(stream_local_response(payload.message), media_type="text/event-stream")
    except Exception as e:
        print(f"Chatbot server error: {e}. streaming local fallback.")
        return StreamingResponse(stream_local_response(payload.message), media_type="text/event-stream")

# Serve Frontend static files
os.makedirs("public", exist_ok=True)
app.mount("/", StaticFiles(directory="public", html=True), name="public")
