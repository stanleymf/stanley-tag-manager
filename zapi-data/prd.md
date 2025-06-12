# Product Requirements Document: Automated Shopify Customer Tagger

## 1. Overview

This document outlines the requirements for a web application designed to automate customer tagging for Shopify stores. The application will provide store owners with a centralized dashboard to manage customer tags based on their membership in specific Shopify customer segments. By connecting directly to the user's Shopify store, the application will sync customer segments and allow for the creation of continuous, automated rules to add or remove tags as customers move between different segments. The user interface will be inspired by the clean, data-driven design of Klaviyo, prioritizing ease of use and clarity.

## 2. Objectives/Goals

- To automate the process of adding and removing tags for Shopify customers.
- To eliminate the manual effort required to maintain tag accuracy as customer data changes.
- To ensure customer tags are consistently up-to-date based on their segment membership.
- To provide a simple, intuitive, and efficient user interface for managing all tagging logic.
- To offer a clear overview of all Shopify customer segments in a centralized dashboard.

## 3. Features

### 3.1. Shopify Customer Segment Synchronization

- **Description:** This feature enables the application to connect to a user's Shopify store and maintain an up-to-date list of all customer segments.
- **Application Flow: Initial Setup and Synchronization**
    1. The user initiates the process to connect their Shopify store.
    2. The user is redirected to Shopify's authentication screen to grant the application necessary permissions (e.g., read customers, modify customers, read customer segments).
    3. Upon successful authentication, the application performs an initial, full synchronization of all existing customer segments from the user's Shopify store.
    4. The application's dashboard is then populated with the synced customer segments.
    5. The system will automatically perform periodic re-synchronizations with Shopify to fetch any new, updated, or deleted segments to ensure data is always current.

### 3.2. Dashboard and Segments View

- **Description:** The dashboard serves as the main landing page of the application, providing an at-a-glance view of all synced Shopify customer segments.
- **User Journey: Viewing Customer Segments**
    1. Upon logging in, the user is directed to the main dashboard.
    2. The dashboard displays a table listing all customer segments.
    3. Each row in the table represents a single segment and contains the following information:
        - Segment Name (e.g., "VIP Customers")
        - Number of customers within that segment.
        - The date and time of the last synchronization.
    4. The user can use this view to get a quick overview of their customer segmentation structure.

### 3.3. Automated Tagging Rules

- **Description:** This is the core feature of the application, allowing users to create, manage, and automate tagging logic based on customer segment membership.
- **User Journey: Creating a New Tagging Rule**
    1. The user navigates to the "Rules" section of the application.
    2. The user clicks the "Create Rule" button.
    3. A form or modal appears for defining the new rule's logic.
    4. The user enters a descriptive name for the rule (e.g., "Assign VVIP Status").
    5. The user defines a trigger condition using a dropdown menu. The format is "WHEN a customer is a member of [Select Segment]". The user selects a Shopify segment from the list (e.g., "VVIP Segment").
    6. The user defines the corresponding actions. The format is "THEN [Add/Remove] tag [Tag Name]". The user can add multiple actions. For example:
        - Action 1: Add tag "VVIP"
        - Action 2: Remove tag "VIP"
    7. The user saves the rule. The new rule is now active and will be executed continuously by the system.
- **User Journey: Managing Existing Rules**
    1. The user navigates to the "Rules" section.
    2. A table lists all previously created rules.
    3. Each row in the table displays the rule's name, its trigger condition, its actions, and its current status (e.g., Active/Inactive).
    4. The user has the ability to toggle a rule between "Active" and "Inactive" states directly from this list.
    5. The user can click on a rule to open an editing view, where they can modify its name, trigger, or actions.
    6. The user can also permanently delete a rule from the list.

## 4. Technical Requirements

### 4.1. System Architecture

- **Frontend:** A client-side Single Page Application (SPA) built with React.
- **Backend:** A server-side application responsible for handling business logic, communicating with the Shopify API, processing rules, and managing data.

### 4.2. Functional Technical Requirements

- **Authentication:** The application will use the Shopify OAuth 2.0 flow to securely authenticate and gain API access to a user's store.
- **Data Synchronization:** The backend will implement a recurring job to periodically poll the Shopify API for changes to customer segments and their members.
- **Rule Engine:** A background processing system will continuously evaluate active rules against the customer database. When a customer's segment membership changes in a way that matches a rule's trigger, the engine will queue a job to update that customer's tags via the Shopify API.

### 4.3. Backend API Endpoints

- `POST /api/auth/shopify`: Initiates the Shopify OAuth authentication flow.
- `GET /api/auth/shopify/callback`: Handles the callback from Shopify after user authorization.
- `GET /api/segments`: Retrieves a paginated list of all synced customer segments.
- `POST /api/sync/segments`: Manually triggers a re-sync of customer segments from Shopify.
- `GET /api/rules`: Retrieves a list of all created tagging rules.
- `POST /api/rules`: Creates a new tagging rule.
- `GET /api/rules/{ruleId}`: Retrieves the details of a specific tagging rule.
- `PUT /api/rules/{ruleId}`: Updates an existing tagging rule.
- `DELETE /api/rules/{ruleId}`: Deletes a specific tagging rule.

## 5. Design Style

- **Design Philosophy:** The design will be clean, intuitive, and data-focused. The primary goal is to provide a frictionless user experience that makes complex automation feel simple and accessible.
- **Style:** A modern and minimalist aesthetic, drawing inspiration from the Klaviyo user interface.
- **Theme:** A light theme will be used to ensure high readability and a professional feel.
- **Color Palette:**
    - **Primary:** A neutral off-white or light gray for the background.
    - **Text:** A dark charcoal color for body text and labels to ensure high contrast.
    - **Accent:** A vibrant, professional blue will be used for primary call-to-action buttons, links, and to highlight active or selected items.
    - **Status Indicators:** Green will indicate "Active" or "Success" states, while a neutral gray will indicate "Inactive" states.
- **Typography:** A clean, legible sans-serif font, such as Inter, will be used throughout the application. A clear typographic hierarchy will be established using variations in font size, weight, and color to distinguish between page titles, section headers, and body content.
- **Layout:** The main layout will feature a fixed sidebar for navigation on the left and a main content area on the right. Content such as lists of segments and rules will be presented in well-structured tables with ample spacing to avoid a cluttered appearance.

## 6. Assumptions / Constraints

### 6.1. Assumptions

- Users of this application will have a Shopify store and the necessary administrative permissions to install apps and grant API access.
- The logic for defining customer segments (e.g., based on total spend, location, etc.) is managed exclusively within Shopify. This application only reads segment data.
- Shopify's API provides reliable and timely access to customer segment and tag data.
- A slight delay between a customer's status changing in Shopify and the corresponding tag update via this application is acceptable.

### 6.2. Constraints

- This project will initially be developed as a UI-only prototype. All backend functionality, including API calls and data persistence, will be mocked using local storage.
- The technology stack is limited to React, shadcn/ui, and Tailwind CSS for the frontend.
- The application is designed for use in modern web browsers and will not be developed for native mobile or desktop platforms.