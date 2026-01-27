import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import { storage } from "./storage";
import { scrapeWebsite, cleanupScrapeFiles } from "./scraper";
import { startScrapeSchema } from "@shared/schema";
import type { Asset, ScrapeProgress, ScrapeJob } from "@shared/schema";

// Store active WebSocket connections by job ID
const jobConnections = new Map<string, Set<WebSocket>>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  wss.on("connection", (ws) => {
    let subscribedJobId: string | null = null;
    
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === "subscribe" && data.jobId) {
          subscribedJobId = data.jobId;
          
          if (!jobConnections.has(data.jobId)) {
            jobConnections.set(data.jobId, new Set());
          }
          jobConnections.get(data.jobId)!.add(ws);
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });
    
    ws.on("close", () => {
      if (subscribedJobId) {
        const connections = jobConnections.get(subscribedJobId);
        if (connections) {
          connections.delete(ws);
          if (connections.size === 0) {
            jobConnections.delete(subscribedJobId);
          }
        }
      }
    });
  });
  
  // Broadcast to all connections for a job
  function broadcast(jobId: string, data: any) {
    const connections = jobConnections.get(jobId);
    if (connections) {
      const message = JSON.stringify(data);
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }
  
  // Start a new scrape job
  app.post("/api/scrape", async (req, res) => {
    try {
      const validatedData = startScrapeSchema.parse(req.body);
      
      // Create job in storage
      const job = await storage.createJob(validatedData.url);
      
      // Start scraping in background
      (async () => {
        try {
          const zipPath = await scrapeWebsite({
            jobId: job.id,
            url: validatedData.url,
            onProgress: (progress: ScrapeProgress, asset?: Asset) => {
              // Send progress update
              broadcast(job.id, { type: "progress", progress });
              
              // Send asset update if available
              if (asset) {
                broadcast(job.id, { type: "asset", asset });
              }
            },
          });
          
          // Complete job
          const completedJob = await storage.completeJob(job.id, zipPath);
          
          // Send completion
          broadcast(job.id, { type: "complete", job: completedJob });
          
        } catch (error) {
          console.error("Scrape error:", error);
          await storage.updateJobStatus(job.id, "failed");
          broadcast(job.id, {
            type: "error",
            message: error instanceof Error ? error.message : "Scraping failed",
          });
        }
      })();
      
      res.json(job);
    } catch (error) {
      console.error("Scrape start error:", error);
      res.status(400).json({
        message: error instanceof Error ? error.message : "Invalid request",
      });
    }
  });
  
  // Get job status
  app.get("/api/scrape/:id", async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job" });
    }
  });
  
  // Download scraped content
  app.get("/api/scrape/:id/download", async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      if (job.status !== "completed" || !job.downloadPath) {
        return res.status(400).json({ message: "Download not ready" });
      }
      
      // Check if file exists
      try {
        await fs.promises.access(job.downloadPath);
      } catch {
        return res.status(404).json({ message: "Download file not found" });
      }
      
      const hostname = new URL(job.url).hostname;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${hostname}-backup.zip"`
      );
      
      const fileStream = fs.createReadStream(job.downloadPath);
      fileStream.pipe(res);
      
      // Clean up after download (with delay to ensure download completes)
      fileStream.on("end", () => {
        setTimeout(async () => {
          await cleanupScrapeFiles(job.id);
          await storage.deleteJob(job.id);
        }, 5000);
      });
      
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Download failed" });
    }
  });

  return httpServer;
}
