import Navbar from "./Nav";
import Footer from "./Footer";

function Layout({ children }) {
    return (
        <div className="flex flex-col min-h-screen bg-gray-100">
            <Navbar />

            <main className="grow px-6 w-3/5 mx-auto">
                {children}
            </main>

            <Footer />
        </div>
    );
}

export default Layout;
