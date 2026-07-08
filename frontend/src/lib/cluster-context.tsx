"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { Cluster } from "./types";

interface ClusterContextValue {
  clusters: Cluster[];
  selectedClusterId: string | "all";
  setSelectedClusterId: (id: string | "all") => void;
  /** undefined when "all" is selected — spread this into query params */
  clusterParam: { cluster_id?: string };
}

const ClusterContext = createContext<ClusterContextValue | null>(null);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [selectedClusterId, setSelectedClusterIdState] = useState<string | "all">("all");

  const { data: clusters } = useQuery<Cluster[]>({
    queryKey: ["clusters"],
    queryFn: async () => (await api.get("/clusters")).data,
  });

  useEffect(() => {
    const stored = localStorage.getItem("bcc_cluster");
    if (stored) setSelectedClusterIdState(stored);
  }, []);

  function setSelectedClusterId(id: string | "all") {
    setSelectedClusterIdState(id);
    localStorage.setItem("bcc_cluster", id);
  }

  const clusterParam = selectedClusterId === "all" ? {} : { cluster_id: selectedClusterId };

  return (
    <ClusterContext.Provider value={{ clusters: clusters || [], selectedClusterId, setSelectedClusterId, clusterParam }}>
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  const ctx = useContext(ClusterContext);
  if (!ctx) throw new Error("useCluster must be used within ClusterProvider");
  return ctx;
}
