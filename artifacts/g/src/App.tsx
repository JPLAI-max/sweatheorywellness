import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Feed from "@/pages/Feed";
import Explore from "@/pages/Explore";
import Profile from "@/pages/Profile";
import PostDetail from "@/pages/PostDetail";
import StreamPage from "@/pages/StreamPage";
import GoLive from "@/pages/GoLive";
import Messages from "@/pages/Messages";
import Wallet from "@/pages/Wallet";
import Notifications from "@/pages/Notifications";
import Settings from "@/pages/Settings";
import Bookmarks from "@/pages/Bookmarks";
import Hashtag from "@/pages/Hashtag";
import Analytics from "@/pages/Analytics";
import Watch from "@/pages/Watch";
import Meetups from "@/pages/Meetups";
import Marketplace from "@/pages/Marketplace";
import Pricing from "@/pages/Pricing";
import TermsOfService from "@/pages/TermsOfService";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import CommunityGuidelines from "@/pages/CommunityGuidelines";
import SweatheoryApproved from "@/pages/SweatheoryApproved";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Brand from "@/pages/Brand";
import Contact from "@/pages/Contact";
import Legal from "@/pages/Legal";
import DMCA from "@/pages/DMCA";
import AdvertiserAgreement from "@/pages/AdvertiserAgreement";
import TrademarksIP from "@/pages/TrademarksIP";
import AuctionDetail from "@/pages/AuctionDetail";
import CreateAuction from "@/pages/CreateAuction";
import MerchMarketplace from "@/pages/MerchMarketplace";
import CreateMerch from "@/pages/CreateMerch";
import MerchProduct from "@/pages/MerchProduct";
import MerchOrders from "@/pages/MerchOrders";
import AffiliateMarketplace from "@/pages/AffiliateMarketplace";
import LinkInBio from "@/pages/LinkInBio";
import NotFound from "@/pages/not-found";
import Admin from "@/pages/Admin";
import Subscriptions from "@/pages/Subscriptions";
import Library from "@/pages/Library";
import CustomRequests from "@/pages/CustomRequests";
import OAuthCallback from "@/pages/OAuthCallback";
import ShareTarget from "@/pages/ShareTarget";
import CookiePolicy from "@/pages/CookiePolicy";
import { HelpLinktree, HelpBeacons, HelpAllMyLinks, HelpStan } from "@/pages/HelpPlatformPage";
import { isLoggedIn, clearAuth } from "@/lib/auth";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { UploadProvider } from "@/contexts/UploadContext";
import { NavigationGuard } from "@/components/NavigationGuard";
import { SplashScreen } from "@/components/SplashScreen";
import { useState } from "react";

// In dev/preview, cookies may be blocked in cross-site iframes (Replit canvas).
// Fall back to a localStorage token sent as an Authorization Bearer header.
setAuthTokenGetter(() => localStorage.getItem("g_dev_token"));

function onGlobalError(error: unknown) {
  if ((error as any)?.status === 401) {
    clearAuth();
    window.location.href = "/login";
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onGlobalError }),
  mutationCache: new MutationCache({ onError: onGlobalError }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if ((error as any)?.status === 401) return false;
        return failureCount < 1;
      },
      staleTime: 30000,
    },
  },
});

function AppRouter() {
  return (
    <Switch>
      <Route path="/admin" component={Admin} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/auth/reddit/callback" component={OAuthCallback} />
      <Route path="/auth/x/callback" component={OAuthCallback} />
      <Route path="/share-target" component={ShareTarget} />
      <Route path="/@:username" component={LinkInBio} />
      <Route path="/">
        {() => isLoggedIn() ? (
          <Layout><Feed /></Layout>
        ) : (
          <Landing />
        )}
      </Route>
      <Route>
        {() => (
          <Layout>
            <Switch>
              <Route path="/feed" component={Feed} />
              <Route path="/explore" component={Explore} />
              <Route path="/profile/:username" component={Profile} />
              <Route path="/post/:postId" component={PostDetail} />
              <Route path="/stream/:streamId" component={StreamPage} />
              <Route path="/go-live" component={GoLive} />
              <Route path="/messages/:conversationId" component={Messages} />
              <Route path="/messages" component={Messages} />
              <Route path="/wallet" component={Wallet} />
              <Route path="/notifications" component={Notifications} />
              <Route path="/settings" component={Settings} />
              <Route path="/bookmarks" component={Bookmarks} />
              <Route path="/hashtag/:tag" component={Hashtag} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/watch" component={Watch} />
              <Route path="/meetups" component={Meetups} />
              <Route path="/marketplace" component={Marketplace} />
              <Route path="/affiliate" component={AffiliateMarketplace} />
              <Route path="/pricing" component={Pricing} />
              <Route path="/terms" component={TermsOfService} />
              <Route path="/privacy" component={PrivacyPolicy} />
              <Route path="/guidelines" component={CommunityGuidelines} />
              <Route path="/approved" component={SweatheoryApproved} />
              <Route path="/brand" component={Brand} />
              <Route path="/contact" component={Contact} />
              <Route path="/legal" component={Legal} />
              <Route path="/dmca" component={DMCA} />
              <Route path="/advertiser-agreement" component={AdvertiserAgreement} />
              <Route path="/trademarks" component={TrademarksIP} />
              <Route path="/create-auction" component={CreateAuction} />
              <Route path="/auction/:id" component={AuctionDetail} />
              <Route path="/merch" component={MerchMarketplace} />
              <Route path="/merch/create" component={CreateMerch} />
              <Route path="/merch/orders" component={MerchOrders} />
              <Route path="/merch/:id" component={MerchProduct} />
              <Route path="/subscriptions" component={Subscriptions} />
              <Route path="/library" component={Library} />
              <Route path="/requests" component={CustomRequests} />
              <Route path="/cookies" component={CookiePolicy} />
              <Route path="/help/linktree" component={HelpLinktree} />
              <Route path="/help/beacons" component={HelpBeacons} />
              <Route path="/help/allmylinks" component={HelpAllMyLinks} />
              <Route path="/help/stan" component={HelpStan} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UploadProvider>
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <NavigationGuard />
            <AppRouter />
          </WouterRouter>
          <Toaster />
          <CookieConsentBanner />
        </UploadProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
