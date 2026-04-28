import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import App from "./App";
import "./index.css";
import { ProductPage } from "./pages/ProductPage";
import { AdminLabels } from "./pages/AdminLabels";
import { AdminTestEmail } from "./pages/AdminTestEmail";
import { AuthProvider } from "./admin/AuthContext";
import { ProtectedRoute } from "./admin/ProtectedRoute";
import { AdminLayout } from "./admin/AdminLayout";
import { LoginPage } from "./admin/LoginPage";
import { DashboardPage } from "./admin/DashboardPage";
import { FirmsPage } from "./admin/FirmsPage";
import { ProductsPage } from "./admin/ProductsPage";
import { CatalogPage } from "./admin/CatalogPage";
import { AssetsPage } from "./admin/AssetsPage";
import { TicketsPage } from "./admin/TicketsPage";
import { UsersPage } from "./admin/UsersPage";
import { AccessoriesPage } from "./admin/AccessoriesPage";
import { QuickRegisterPage } from "./admin/QuickRegisterPage";
import { LocationsPage } from "./admin/LocationsPage";
import { ScanPage } from "./admin/ScanPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/p/:uuid" element={<ProductPage />} />

          <Route path="/admin/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<DashboardPage />} />
              <Route element={<ProtectedRoute requireSuper />}>
                <Route path="/admin/firms" element={<FirmsPage />} />
                <Route path="/admin/catalog" element={<CatalogPage />} />
                <Route path="/admin/tickets" element={<TicketsPage />} />
              </Route>
              <Route path="/admin/firms/:firmId/products" element={<ProductsPage />} />
              <Route path="/admin/firms/:firmId/assets" element={<AssetsPage />} />
              <Route path="/admin/firms/:firmId/scan" element={<ScanPage />} />
              <Route path="/admin/firms/:firmId/locations" element={<LocationsPage />} />
              <Route path="/admin/firms/:firmId/register" element={<QuickRegisterPage />} />
              <Route path="/admin/firms/:firmId/accessories" element={<AccessoriesPage />} />
              <Route path="/admin/firms/:firmId/tickets" element={<TicketsPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/labels" element={<AdminLabels />} />
              <Route path="/admin/test-email" element={<AdminTestEmail />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
