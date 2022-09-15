import { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getSession(req, res);
  if (!session?.user.id) return res.status(401).end("Unauthorized");

  // GET /api/projects – get all projects associated with the authenticated user
  if (req.method === "GET") {
    const response = await prisma.project.findMany({
      where: {
        users: {
          some: {
            userId: session.user.id,
          },
        },
      },
    });
    return res.status(200).json(response);

    // POST /api/projects – create a new project
  } else if (req.method === "POST") {
    const { name, slug, domain } = req.body;
    if (!name || !slug || !domain) {
      return res.status(400).json({ error: "Missing name or slug or domain" });
    }

    try {
      const project = await prisma.project.create({
        data: {
          name,
          slug,
          domain,
          users: {
            create: {
              userId: session.user.id,
              role: "owner",
            },
          },
        },
      });
      if (project?.domain) {
        const response = await fetch(
          `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains?teamId=${process.env.VERCEL_TEAM_ID}`,
          {
            body: `{\n  "name": "${project.domain}"\n}`,
            headers: {
              Authorization: `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
              "Content-Type": "application/json",
            },
            method: "POST",
          }
        );
        const json = await response.json();
        return res.status(200).json({ project, domain: json });
      }
      return res.status(400).json({ error: "Project not created" });
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(400).json({ error: "Project slug already exists" });
      }
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}