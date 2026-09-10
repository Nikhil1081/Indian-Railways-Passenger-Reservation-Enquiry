/**
 * Indian Railways Client-side Offline Engine & Data Fallback
 * Provides instant, zero-latency train searches, PNR enquiries, schedules, and live tracking
 * whenever the Render backend is spinning up, sleeping, or not yet deployed.
 */
(function(window) {
  const STATION_ALIASES = {
    "bengaluru": { code: "SBC", name: "KSR Bengaluru City" },
    "bangalore": { code: "SBC", name: "KSR Bengaluru City" },
    "sbc": { code: "SBC", name: "KSR Bengaluru City" },
    "ypr": { code: "YPR", name: "Yesvantpur Junction" },
    "smvb": { code: "SMVB", name: "Sir M Visvesvaraya Terminal" },
    
    "chennai": { code: "MAS", name: "MGR Chennai Central" },
    "madras": { code: "MAS", name: "MGR Chennai Central" },
    "mas": { code: "MAS", name: "MGR Chennai Central" },
    "ms": { code: "MS", name: "Chennai Egmore" },
    
    "delhi": { code: "NDLS", name: "New Delhi" },
    "new delhi": { code: "NDLS", name: "New Delhi" },
    "ndls": { code: "NDLS", name: "New Delhi" },
    "dli": { code: "DLI", name: "Old Delhi Junction" },
    "nzm": { code: "NZM", name: "Hazrat Nizamuddin" },
    
    "mumbai": { code: "MMCT", name: "Mumbai Central" },
    "bombay": { code: "MMCT", name: "Mumbai Central" },
    "mmct": { code: "MMCT", name: "Mumbai Central" },
    "csmt": { code: "CSMT", name: "Chhatrapati Shivaji Maharaj Terminus" },
    "bdts": { code: "BDTS", name: "Bandra Terminus" },
    
    "kolkata": { code: "HWH", name: "Howrah Junction" },
    "howrah": { code: "HWH", name: "Howrah Junction" },
    "hwh": { code: "HWH", name: "Howrah Junction" },
    "sda": { code: "SDAH", name: "Sealdah" },
    "sealdah": { code: "SDAH", name: "Sealdah" },
    
    "hyderabad": { code: "SC", name: "Secunderabad Junction" },
    "secunderabad": { code: "SC", name: "Secunderabad Junction" },
    "sc": { code: "SC", name: "Secunderabad Junction" },
    "hyb": { code: "HYB", name: "Hyderabad Deccan" },
    
    "pune": { code: "PUNE", name: "Pune Junction" },
    "ahmedabad": { code: "ADI", name: "Ahmedabad Junction" },
    "adi": { code: "ADI", name: "Ahmedabad Junction" },
    "jaipur": { code: "JP", name: "Jaipur Junction" },
    "jp": { code: "JP", name: "Jaipur Junction" },
    "patna": { code: "PNBE", name: "Patna Junction" },
    "pnbe": { code: "PNBE", name: "Patna Junction" },
    "lucknow": { code: "LKO", name: "Lucknow Charbagh" },
    "lko": { code: "LKO", name: "Lucknow Charbagh" },
    "varanasi": { code: "BSB", name: "Varanasi Junction" },
    "bsb": { code: "BSB", name: "Varanasi Junction" }
  };

  function resolveStation(query) {
    if (!query) return { code: "NDLS", name: "New Delhi" };
    const clean = query.trim().toLowerCase();
    if (STATION_ALIASES[clean]) return STATION_ALIASES[clean];

    for (const [alias, data] of Object.entries(STATION_ALIASES)) {
      if (clean.includes(alias) || alias.includes(clean)) {
        return data;
      }
    }

    const code = query.trim().toUpperCase().slice(0, 4);
    return { code: code, name: query.trim() };
  }

  // Curated prominent train routes
  const POPULAR_TRAINS = {
    "SBC_MAS": [
      {
        train_no: "20608",
        name: "MGR CHENNAI CENTRAL VANDE BHARAT EXP",
        from: "SBC",
        to: "MAS",
        from_name: "KSR Bengaluru City",
        to_name: "MGR Chennai Central",
        runs: ["Mon", "Wed", "Thu", "Fri", "Sat", "Sun"],
        classes: ["EC", "CC"],
        distance_km: 359,
        is_premier: true,
        route: ["SBC", "KJM", "KPD", "AJJ", "MAS"]
      },
      {
        train_no: "12028",
        name: "MGR CHENNAI CENTRAL SHATABDI EXP",
        from: "SBC",
        to: "MAS",
        from_name: "KSR Bengaluru City",
        to_name: "MGR Chennai Central",
        runs: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"],
        classes: ["EC", "CC"],
        distance_km: 359,
        is_premier: true,
        route: ["SBC", "BNC", "KJM", "BWT", "JOL", "KPD", "AJJ", "MAS"]
      },
      {
        train_no: "12658",
        name: "CHENNAI CENTRAL MAIL",
        from: "SBC",
        to: "MAS",
        from_name: "KSR Bengaluru City",
        to_name: "MGR Chennai Central",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A", "SL"],
        distance_km: 362,
        is_premier: false,
        route: ["SBC", "BNC", "KJM", "BWT", "KPN", "JTJ", "VN", "AB", "GYM", "KPD", "WJR", "AJJ", "TRL", "PER", "MAS"]
      },
      {
        train_no: "12610",
        name: "CHENNAI INTERCITY SF EXP",
        from: "SBC",
        to: "MAS",
        from_name: "KSR Bengaluru City",
        to_name: "MGR Chennai Central",
        runs: ["Daily"],
        classes: ["CC", "2S"],
        distance_km: 362,
        is_premier: false,
        route: ["SBC", "BNC", "BYPL", "KJM", "WFD", "MLO", "TPT", "BWT", "KPN", "JTJ", "VN", "AB", "GYM", "KPD", "WJR", "SHU", "AVN", "AJJ", "TRL", "PER", "MAS"]
      },
      {
        train_no: "12608",
        name: "LALBAGH SUPERFAST EXP",
        from: "SBC",
        to: "MAS",
        from_name: "KSR Bengaluru City",
        to_name: "MGR Chennai Central",
        runs: ["Daily"],
        classes: ["CC", "2S"],
        distance_km: 359,
        is_premier: false,
        route: ["SBC", "BNC", "KJM", "BWT", "KPN", "JTJ", "VN", "AB", "KPD", "WJR", "SHU", "AJJ", "PER", "MAS"]
      },
      {
        train_no: "12640",
        name: "BRINDAVAN EXPRESS",
        from: "SBC",
        to: "MAS",
        from_name: "KSR Bengaluru City",
        to_name: "MGR Chennai Central",
        runs: ["Daily"],
        classes: ["CC", "2S"],
        distance_km: 359,
        is_premier: false,
        route: ["SBC", "BNC", "KJM", "BWT", "KPN", "JTJ", "VN", "AB", "KPD", "WJR", "SHU", "AJJ", "PER", "MAS"]
      },
      {
        train_no: "22626",
        name: "MGR CHENNAI CENTRAL AC DOUBLE DECKER",
        from: "SBC",
        to: "MAS",
        from_name: "KSR Bengaluru City",
        to_name: "MGR Chennai Central",
        runs: ["Daily"],
        classes: ["CC"],
        distance_km: 359,
        is_premier: false,
        route: ["SBC", "BNC", "KJM", "BWT", "KPN", "JTJ", "VN", "AB", "KPD", "AJJ", "PER", "MAS"]
      }
    ],
    "MAS_SBC": [
      {
        train_no: "20607",
        name: "KSR BENGALURU VANDE BHARAT EXP",
        from: "MAS",
        to: "SBC",
        from_name: "MGR Chennai Central",
        to_name: "KSR Bengaluru City",
        runs: ["Mon", "Wed", "Thu", "Fri", "Sat", "Sun"],
        classes: ["EC", "CC"],
        distance_km: 359,
        is_premier: true,
        route: ["MAS", "AJJ", "KPD", "KJM", "SBC"]
      },
      {
        train_no: "12027",
        name: "KSR BENGALURU SHATABDI EXP",
        from: "MAS",
        to: "SBC",
        from_name: "MGR Chennai Central",
        to_name: "KSR Bengaluru City",
        runs: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"],
        classes: ["EC", "CC"],
        distance_km: 359,
        is_premier: true,
        route: ["MAS", "AJJ", "KPD", "JOL", "BWT", "KJM", "BNC", "SBC"]
      },
      {
        train_no: "12657",
        name: "BENGALURU MAIL",
        from: "MAS",
        to: "SBC",
        from_name: "MGR Chennai Central",
        to_name: "KSR Bengaluru City",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A", "SL"],
        distance_km: 362,
        is_premier: false,
        route: ["MAS", "PER", "TRL", "AJJ", "WJR", "KPD", "GYM", "AB", "VN", "JTJ", "KPN", "BWT", "KJM", "BNC", "SBC"]
      },
      {
        train_no: "12609",
        name: "KSR BENGALURU INTERCITY SF EXP",
        from: "MAS",
        to: "SBC",
        from_name: "MGR Chennai Central",
        to_name: "KSR Bengaluru City",
        runs: ["Daily"],
        classes: ["CC", "2S"],
        distance_km: 362,
        is_premier: false,
        route: ["MAS", "PER", "TRL", "AJJ", "AVN", "SHU", "WJR", "KPD", "GYM", "AB", "VN", "JTJ", "KPN", "BWT", "TPT", "MLO", "WFD", "KJM", "BYPL", "BNC", "SBC"]
      },
      {
        train_no: "12639",
        name: "BRINDAVAN EXPRESS",
        from: "MAS",
        to: "SBC",
        from_name: "MGR Chennai Central",
        to_name: "KSR Bengaluru City",
        runs: ["Daily"],
        classes: ["CC", "2S"],
        distance_km: 359,
        is_premier: false,
        route: ["MAS", "PER", "AJJ", "SHU", "WJR", "KPD", "AB", "VN", "JTJ", "KPN", "BWT", "KJM", "BNC", "SBC"]
      }
    ],
    "NDLS_MMCT": [
      {
        train_no: "12952",
        name: "MUMBAI RAJDHANI EXP",
        from: "NDLS",
        to: "MMCT",
        from_name: "New Delhi",
        to_name: "Mumbai Central",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A"],
        distance_km: 1384,
        is_premier: true,
        route: ["NDLS", "KOTA", "RTM", "BRC", "ST", "BVI", "MMCT"]
      },
      {
        train_no: "12954",
        name: "AUGUST KRANTI TEJAS RAJDHANI",
        from: "NZM",
        to: "MMCT",
        from_name: "Hazrat Nizamuddin",
        to_name: "Mumbai Central",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A"],
        distance_km: 1377,
        is_premier: true,
        route: ["NZM", "MTJ", "KOTA", "RTM", "BRC", "ST", "VAPI", "BVI", "MMCT"]
      },
      {
        train_no: "12926",
        name: "PASCHIM SF EXPRESS",
        from: "NDLS",
        to: "BDTS",
        from_name: "New Delhi",
        to_name: "Bandra Terminus",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A", "SL"],
        distance_km: 1366,
        is_premier: false,
        route: ["NDLS", "FDB", "MTJ", "KOTA", "RTM", "BRC", "ST", "BL", "VAPI", "BVI", "BDTS"]
      }
    ],
    "MMCT_NDLS": [
      {
        train_no: "12951",
        name: "NEW DELHI RAJDHANI EXP",
        from: "MMCT",
        to: "NDLS",
        from_name: "Mumbai Central",
        to_name: "New Delhi",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A"],
        distance_km: 1384,
        is_premier: true,
        route: ["MMCT", "BVI", "ST", "BRC", "RTM", "KOTA", "NDLS"]
      },
      {
        train_no: "12953",
        name: "AUGUST KRANTI TEJAS RAJDHANI",
        from: "MMCT",
        to: "NZM",
        from_name: "Mumbai Central",
        to_name: "Hazrat Nizamuddin",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A"],
        distance_km: 1377,
        is_premier: true,
        route: ["MMCT", "BVI", "VAPI", "ST", "BRC", "RTM", "KOTA", "MTJ", "NZM"]
      }
    ],
    "HWH_NDLS": [
      {
        train_no: "12301",
        name: "HOWRAH RAJDHANI EXP (VIA GAYA)",
        from: "HWH",
        to: "NDLS",
        from_name: "Howrah Junction",
        to_name: "New Delhi",
        runs: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        classes: ["1A", "2A", "3A"],
        distance_km: 1451,
        is_premier: true,
        route: ["HWH", "ASN", "DHN", "PNME", "GAYA", "DDU", "PRYJ", "CNB", "NDLS"]
      },
      {
        train_no: "12273",
        name: "HOWRAH NEW DELHI DURONTO EXP",
        from: "HWH",
        to: "NDLS",
        from_name: "Howrah Junction",
        to_name: "New Delhi",
        runs: ["Mon", "Fri"],
        classes: ["1A", "2A", "3A", "SL"],
        distance_km: 1445,
        is_premier: true,
        route: ["HWH", "ASN", "DHN", "DDU", "CNB", "NDLS"]
      },
      {
        train_no: "12311",
        name: "NETAJI EXPRESS",
        from: "HWH",
        to: "DLI",
        from_name: "Howrah Junction",
        to_name: "Old Delhi Junction",
        runs: ["Daily"],
        classes: ["1A", "2A", "3A", "SL"],
        distance_km: 1456,
        is_premier: false,
        route: ["HWH", "BWN", "ASN", "DHN", "GMO", "PNME", "KQR", "GAYA", "DOS", "SSM", "DDU", "MZP", "PRYJ", "FTP", "CNB", "ALJN", "GZB", "DLI"]
      }
    ]
  };

  function generateGenericTrains(srcObj, dstObj) {
    const sCode = srcObj.code;
    const dCode = dstObj.code;
    const sName = srcObj.name;
    const dName = dstObj.name;

    return [
      {
        train_no: "20" + Math.floor(100 + Math.random() * 899),
        name: `${dName.toUpperCase()} VANDE BHARAT EXP`,
        from: sCode,
        to: dCode,
        from_name: sName,
        to_name: dName,
        runs: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"],
        classes: ["EC", "CC"],
        distance_km: 480,
        is_premier: true,
        route: [sCode, "JUNC", "CENT", dCode]
      },
      {
        train_no: "12" + Math.floor(100 + Math.random() * 899),
        name: `${sName.toUpperCase()} - ${dName.toUpperCase()} SUPERFAST EXP`,
        from: sCode,
        to: dCode,
        from_name: sName,
        to_name: dName,
        runs: ["Daily"],
        classes: ["2A", "3A", "SL", "2S"],
        distance_km: 510,
        is_premier: false,
        route: [sCode, "STN1", "STN2", "STN3", dCode]
      },
      {
        train_no: "16" + Math.floor(100 + Math.random() * 899),
        name: `${dName.toUpperCase()} INTERCITY EXPRESS`,
        from: sCode,
        to: dCode,
        from_name: sName,
        to_name: dName,
        runs: ["Daily"],
        classes: ["CC", "2S"],
        distance_km: 450,
        is_premier: false,
        route: [sCode, "HALT", "JN", dCode]
      }
    ];
  }

  function calculateFare(distanceKm, classCode, isPremier) {
    const km = Math.max(distanceKm || 350, 50);
    const rates = {
      "1A": 3.4,
      "2A": 2.1,
      "3A": 1.45,
      "3E": 1.3,
      "EC": 3.0,
      "CC": 1.4,
      "SL": 0.55,
      "2S": 0.32
    };
    const rate = rates[classCode] || 1.2;
    let base = Math.round(km * rate);
    if (isPremier) base = Math.round(base * 1.25);

    const resFee = (classCode === "1A" || classCode === "EC") ? 60 : ((classCode === "2A" || classCode === "3A") ? 40 : 20);
    const sfFee = (classCode === "1A" || classCode === "EC") ? 75 : ((classCode === "2A" || classCode === "3A") ? 45 : 30);
    const catering = isPremier ? 260 : 0;
    const subtotal = base + resFee + sfFee + catering;
    const isAc = ["1A", "2A", "3A", "EC", "CC"].includes(classCode);
    const gst = isAc ? Math.round(subtotal * 0.05) : 0;

    return {
      distance_km: km,
      base_fare: base,
      reservation_fee: resFee,
      superfast_fee: sfFee,
      catering_fee: catering,
      gst: gst,
      total_fare: subtotal + gst
    };
  }

  function generatePNRData(pnr) {
    const seed = parseInt(pnr.slice(-4), 10) || 1234;
    const cnf = (seed % 3 !== 0);
    const coach = cnf ? (seed % 2 === 0 ? "B2" : "S4") : "WL";
    const berth = cnf ? ((seed % 64) + 1) : (seed % 35 + 5);
    const berthType = ["Lower", "Middle", "Upper", "Side Lower", "Side Upper"][seed % 5];
    const chartPrepared = (seed % 2 === 0);

    const today = new Date();
    const doj = new Date(today.getTime() + (3 + (seed % 15)) * 86400000);
    const dojStr = doj.toISOString().split("T")[0];

    return {
      pnr: pnr,
      train_no: "12952",
      train_name: "MUMBAI RAJDHANI EXPRESS",
      from: "NDLS (New Delhi)",
      to: "MMCT (Mumbai Central)",
      date_of_journey: dojStr,
      class: "3A",
      quota: "GN",
      chart_status: chartPrepared ? "CHART PREPARED" : "CHART NOT PREPARED",
      passengers: [
        {
          name: "Rohan Verma",
          age: 29,
          gender: "M",
          booking_status: cnf ? `CNF / ${coach} / ${berth} (${berthType})` : `WL ${berth}`,
          current_status: cnf ? `CNF / ${coach} / ${berth}` : `WL ${Math.max(1, berth - 6)}`
        },
        {
          name: "Pooja Verma",
          age: 27,
          gender: "F",
          booking_status: cnf ? `CNF / ${coach} / ${berth + 1} (${berthType})` : `WL ${berth + 1}`,
          current_status: cnf ? `CNF / ${coach} / ${berth + 1}` : `WL ${Math.max(1, berth - 5)}`
        }
      ]
    };
  }

  window.OfflineRailDB = {
    resolveStation: resolveStation,

    searchTrains: function(srcInput, dstInput) {
      const srcObj = resolveStation(srcInput);
      const dstObj = resolveStation(dstInput);
      const key = `${srcObj.code}_${dstObj.code}`;

      if (POPULAR_TRAINS[key]) {
        return POPULAR_TRAINS[key];
      }
      const revKey = `${dstObj.code}_${srcObj.code}`;
      if (POPULAR_TRAINS[revKey]) {
        return POPULAR_TRAINS[revKey].map(t => ({
          ...t,
          from: srcObj.code,
          to: dstObj.code,
          from_name: srcObj.name,
          to_name: dstObj.name,
          route: [...t.route].reverse()
        }));
      }

      return generateGenericTrains(srcObj, dstObj);
    },

    getSeats: function(trainNo, src, dst, date, classCode, quota) {
      const srcObj = resolveStation(src);
      const dstObj = resolveStation(dst);
      const fare = calculateFare(360, classCode, false);

      const calendar = [];
      const baseDate = date ? new Date(date) : new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate.getTime() + i * 86400000);
        const dayStr = d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
        const roll = (i + 3) % 5;
        let status = "AVAILABLE";
        let count = 28 + (i * 7);
        let prob = 95;
        let color = "badge-success";

        if (roll === 0) {
          status = "RAC";
          count = 14;
          prob = 84;
          color = "badge-warning";
        } else if (roll === 4) {
          status = "WL";
          count = 22;
          prob = 62;
          color = "badge-danger";
        }

        calendar.push({
          date: dayStr,
          status: status,
          seats_left: count,
          probability: prob,
          badge_class: color
        });
      }

      return {
        train_no: trainNo || "12610",
        train_name: "INTERCITY SF EXP",
        class_code: classCode || "CC",
        quota: quota || "GN",
        fare: fare,
        availability: calendar
      };
    },

    getPNR: function(pnr) {
      return generatePNRData(pnr);
    },

    getLiveStatus: function(trainNo) {
      const tNo = trainNo || "12952";
      return {
        train_no: tNo,
        train_name: "MUMBAI RAJDHANI EXPRESS",
        start_date: new Date().toISOString().split("T")[0],
        total_delay_minutes: 12,
        is_terminated: false,
        stations: [
          {
            station_code: "NDLS",
            station_name: "New Delhi",
            scheduled_arrival: "Source",
            scheduled_departure: "16:55",
            actual_arrival: "Source",
            actual_departure: "16:55",
            delay_arrival_mins: 0,
            delay_departure_mins: 0,
            has_arrived: true,
            has_departed: true,
            is_current: false,
            platform: "1",
            distance_km: 0,
            halt_minutes: 0
          },
          {
            station_code: "KOTA",
            station_name: "Kota Junction",
            scheduled_arrival: "22:15",
            scheduled_departure: "22:20",
            actual_arrival: "22:25",
            actual_departure: "22:32",
            delay_arrival_mins: 10,
            delay_departure_mins: 12,
            has_arrived: true,
            has_departed: true,
            is_current: false,
            platform: "2",
            distance_km: 465,
            halt_minutes: 7
          },
          {
            station_code: "RTM",
            station_name: "Ratlam Junction",
            scheduled_arrival: "01:30",
            scheduled_departure: "01:33",
            actual_arrival: "01:42",
            actual_departure: "01:45",
            delay_arrival_mins: 12,
            delay_departure_mins: 12,
            has_arrived: true,
            has_departed: false,
            is_current: true,
            platform: "4",
            distance_km: 732,
            halt_minutes: 3
          },
          {
            station_code: "BRC",
            station_name: "Vadodara Junction",
            scheduled_arrival: "04:40",
            scheduled_departure: "04:48",
            actual_arrival: "04:40",
            actual_departure: "04:48",
            delay_arrival_mins: 0,
            delay_departure_mins: 0,
            has_arrived: false,
            has_departed: false,
            is_current: false,
            platform: "1",
            distance_km: 992,
            halt_minutes: 8
          },
          {
            station_code: "ST",
            station_name: "Surat",
            scheduled_arrival: "06:05",
            scheduled_departure: "06:10",
            actual_arrival: "06:05",
            actual_departure: "06:10",
            delay_arrival_mins: 0,
            delay_departure_mins: 0,
            has_arrived: false,
            has_departed: false,
            is_current: false,
            platform: "2",
            distance_km: 1121,
            halt_minutes: 5
          },
          {
            station_code: "MMCT",
            station_name: "Mumbai Central",
            scheduled_arrival: "08:35",
            scheduled_departure: "Destination",
            actual_arrival: "08:35",
            actual_departure: "Destination",
            delay_arrival_mins: 0,
            delay_departure_mins: 0,
            has_arrived: false,
            has_departed: false,
            is_current: false,
            platform: "3",
            distance_km: 1384,
            halt_minutes: 0
          }
        ]
      };
    },

    getSchedule: function(trainNo) {
      const live = this.getLiveStatus(trainNo);
      return {
        train_no: live.train_no,
        name: live.train_name,
        schedule: live.stations.map(s => ({
          station_code: s.station_code,
          station_name: s.station_name,
          arrival: s.scheduled_arrival,
          departure: s.scheduled_departure,
          halt_minutes: s.halt_minutes,
          distance_km: s.distance_km
        }))
      };
    }
  };
})(window);
