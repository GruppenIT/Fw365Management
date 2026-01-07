import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockFirewalls, mockTenants } from "@/lib/mock-data";
import { Shield, Users, Activity, AlertTriangle } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export default function Dashboard() {
  const totalFirewalls = mockFirewalls.length;
  const activeFirewalls = mockFirewalls.filter(f => f.status === "online").length;
  const inactiveFirewalls = mockFirewalls.filter(f => f.status === "offline").length;
  const totalTenants = mockTenants.length;

  // Mock data for the "Uptime Overview" chart
  const uptimeData = [
    { name: "Mon", uptime: 99.9 },
    { name: "Tue", uptime: 99.8 },
    { name: "Wed", uptime: 100 },
    { name: "Thu", uptime: 99.5 },
    { name: "Fri", uptime: 99.9 },
    { name: "Sat", uptime: 100 },
    { name: "Sun", uptime: 100 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your network security infrastructure.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Firewalls</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFirewalls}</div>
            <p className="text-xs text-muted-foreground">Managed devices</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Status</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeFirewalls}</div>
            <p className="text-xs text-muted-foreground">Devices reachable</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline/Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveFirewalls}</div>
            <p className="text-xs text-muted-foreground">Action required</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTenants}</div>
            <p className="text-xs text-muted-foreground">Organizations managed</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>System Uptime</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[200px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                <BarChart data={uptimeData}>
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    domain={[90, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }}
                    cursor={{fill: 'hsl(var(--muted)/0.2)'}}
                  />
                  <Bar 
                    dataKey="uptime" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockFirewalls.filter(f => f.status === "offline").map(f => (
                <div key={f.id} className="flex items-center">
                  <span className="relative flex h-2 w-2 mr-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{f.name} is offline</p>
                    <p className="text-xs text-muted-foreground">{f.hostname} • {f.lastSeen}</p>
                  </div>
                </div>
              ))}
              {mockFirewalls.length === 0 && (
                <p className="text-sm text-muted-foreground">No alerts active.</p>
              )}
               {/* Some Fake Alerts if none are offline to populate the UI */}
               {mockFirewalls.filter(f => f.status === "offline").length === 0 && (
                <>
                  <div className="flex items-center">
                     <span className="flex h-2 w-2 mr-3 rounded-full bg-yellow-500" />
                     <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">High Memory Usage: {mockFirewalls[0]?.name || "HQ Primary"}</p>
                      <p className="text-xs text-muted-foreground">85% usage detected</p>
                     </div>
                  </div>
                   <div className="flex items-center">
                     <span className="flex h-2 w-2 mr-3 rounded-full bg-blue-500" />
                     <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">Firmware Update Available</p>
                      <p className="text-xs text-muted-foreground">OPNSense 24.1.2 is ready</p>
                     </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
