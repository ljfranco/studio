// src/app/__tests__/page.test.tsx
import { render, screen } from '@/tests/test-utils';
import Home from '@/app/page';
import { useAuth } from '@/context/AuthContext';

vi.mock('@/lib/firebase', () => ({
  app: {},
  auth: {},
  db: {},
}));

// Mock the useAuth hook
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useAdminPushSubscription', () => ({
  useAdminPushSubscription: () => {}, // Does nothing
}));

vi.mock('@/hooks/useBusinessName', () => ({
  useBusinessName: () => 'Test Business Name',
}));

describe('Home Page', () => {
  it('renders AuthPage when user is not authenticated', () => {
    // Arrange: Simulate a logged-out user
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
      role: null,
    });

    // Act: Render the Home component
    render(<Home />);

    // Assert: Check for text that appears in AuthPage
    const descriptionElement = screen.getByText(/Accede o crea tu cuenta/i);
    expect(descriptionElement).toBeInTheDocument();
  });

  it('renders AdminDashboard when user is an admin', () => {
    // Arrange: Simulate an admin user
    (useAuth as jest.Mock).mockReturnValue({
      user: { uid: 'admin-user-id' }, // Mock a user object
      loading: false,
      role: 'admin',
    });

    // Act: Render the Home component
    render(<Home />);

    // Assert: Check for the admin dashboard title
    const adminTitle = screen.getByRole('heading', {
      name: /Panel de Administración/i,
    });
    expect(adminTitle).toBeInTheDocument();
  });
});
