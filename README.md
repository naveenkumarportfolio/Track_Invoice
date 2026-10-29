# InvoiceTrack — Invoice & Payment Management System

InvoiceTrack is a simple web application I built to make invoice and payment tracking easier for small businesses.

The idea came from a common business problem: keeping track of invoices, payments received, pending amounts and overdue payments can become difficult when everything is managed manually.

I wanted to build a small application that brings these tasks together in one place. This project also gave me an opportunity to apply the computer science and business concepts I learned through CS50 Computer Science for Business.

## What the Project Does

Depending on the features implemented in the final version, InvoiceTrack allows users to:

- Create, view, edit and delete invoices.
- Calculate invoice totals, taxes and outstanding balances.
- Record full and partial payments.
- Track paid, unpaid, partially paid and overdue invoices.
- Search and filter invoice records.
- View a dashboard with important payment and invoice figures.
- Export invoice and payment information to CSV.
- Save records in the browser using localStorage.

## Why I Built It

I wanted to understand how a simple business problem could be converted into a working software application.

Instead of only studying programming concepts, I wanted to use them to build something practical. InvoiceTrack helped me connect business requirements with programming logic, data handling, calculations and user interface design.

## Technology Used

- **HTML5:** Application structure.
- **CSS3:** Layout, styling and responsive design.
- **JavaScript:** Business logic, calculations, validation and interactivity.
- **Browser localStorage:** Saving application data locally in the browser.
- **CSV export:** Downloading invoice and payment records.
- **Netlify:** Hosting the static website.

## How to Run the Project

1. Download or clone this repository.
2. Keep `index.html`, `style.css` and `script.js` in the same folder.
3. Open `index.html` in a modern web browser.
4. Use the sample records or create your own test invoices.
5. Test the payment tracking, filters and export features.

No package installation or backend server is required for the basic version.

## Key Business Logic

InvoiceTrack uses simple rules to calculate invoice status and outstanding balances.

- **Subtotal:** Quantity multiplied by unit price.
- **Tax:** Subtotal multiplied by the tax rate.
- **Invoice total:** Subtotal plus tax.
- **Outstanding balance:** Invoice total minus recorded payments.
- **Overdue invoice:** An invoice with an outstanding balance and a due date before the current date.
- **Collection rate:** Total payments received divided by total invoiced, multiplied by 100.

The application should prevent invalid payments and recalculate invoice status when payment records change.

## What I Learned

While building this project, I worked on:

- Breaking a business problem into smaller steps.
- Using conditions, loops, functions and data structures.
- Validating user input and handling errors.
- Calculating totals and tracking payment status.
- Managing records and storing data in the browser.
- Designing a simple interface for a business use case.
- Testing functionality and documenting the application.

## Limitations

InvoiceTrack is a learning and portfolio project, not a production accounting system.

The application stores information in browser localStorage. This means records are specific to the browser and device and are not automatically synchronized between users. Browser storage is not encrypted or suitable for sensitive production financial data.

The project does not provide server-side authentication, cloud database synchronization, automated payment collection or integration with accounting software.

Use fictional records for public demonstrations.

## Future Improvements

Some features I would like to explore in future versions include:

- Multiple invoice line items.
- PDF invoice generation.
- A secure backend and database.
- User authentication and cloud synchronization.
- Automated payment reminders.
- More detailed reporting and analytics.


- **Developer:** Naveen Kumar
- BBA Finace and Marketing Analytics , Christ University 

This project was created as part of my practical learning in computer science, business technology and application development.
