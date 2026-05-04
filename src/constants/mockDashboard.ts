import type { PlaceholderChannel } from "@/types/dashboard";

export const placeholderCountries = ["España", "Portugal", "Francia", "Internacional"];

export const placeholderCategories = ["General", "Noticias", "Deportes", "Cine", "Documentales"];

export const placeholderChannels: PlaceholderChannel[] = [
  {
    id: "mock-1",
    name: "Canal autorizado 01",
    country: "España",
    category: "General",
    progress: 68,
    currentProgram: "Programa actual pendiente de EPG",
    timeRange: "18:00 - 19:30",
  },
  {
    id: "mock-2",
    name: "Canal autorizado 02",
    country: "España",
    category: "Noticias",
    progress: 34,
    currentProgram: "Informativo placeholder",
    timeRange: "18:30 - 19:00",
  },
  {
    id: "mock-3",
    name: "Canal autorizado 03",
    country: "España",
    category: "Deportes",
    progress: 45,
    currentProgram: "Evento deportivo placeholder",
    timeRange: "17:45 - 20:00",
  },
];
