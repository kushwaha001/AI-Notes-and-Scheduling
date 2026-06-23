const API_BASE_URL = "http://localhost:8000";

export async function getTodayEvents() {
  console.log("GET /events/today");

  return [
    {
      id: 1,
      title: "Project Review",
      priority: "High",
    },
    {
      id: 2,
      title: "Frontend Meeting",
      priority: "Medium",
    },
  ];
}

export async function uploadFile(file) {
  console.log("POST /upload", file);

  return {
    status: "success",
  };
}