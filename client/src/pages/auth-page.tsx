import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-mock-auth";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import cyberBg from "@assets/generated_images/abstract_cybernetic_network_background_dark_blue_teal.png";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export default function AuthPage() {
  const { login } = useAuth();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "admin@firewall365.com",
      password: "password",
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    login(values.email);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: `url(${cyberBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Gradient Overlay for better text readability */}
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

      <Card className="w-full max-w-md z-10 border-border/50 bg-card/80 backdrop-blur-md shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary mb-2 ring-2 ring-primary/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-display font-bold tracking-tight">Firewall365</CardTitle>
            <CardDescription>
              Secure centralized management for your network infrastructure.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@firewall365.com" {...field} className="bg-background/50 border-input/50 focus:border-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 border-input/50 focus:border-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full font-semibold" size="lg">
                Sign In
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <p>Access restricted to authorized personnel only.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
