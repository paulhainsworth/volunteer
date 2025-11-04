<script>
  import { auth } from '../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';

  onMount(() => {
    if ($auth.user) {
      if ($auth.isAdmin) {
        push('/admin');
      } else if ($auth.profile?.role === 'volunteer_leader') {
        push('/leader');
      } else {
        push('/volunteer');
      }
    }
  });
</script>

<div class="home">
  <div class="hero">
    <h1>🚴 Race Volunteer Management</h1>
    <p class="tagline">Organize, track, and communicate with race volunteers</p>
    
    <div class="cta-buttons">
      <a href="#/auth/signup" class="btn btn-primary">Get Started</a>
      <a href="#/volunteer" class="btn btn-secondary">Browse Opportunities</a>
    </div>
  </div>

  <div class="features">
    <div class="feature-card">
      <div class="icon">📋</div>
      <h3>Easy Role Management</h3>
      <p>Create and manage volunteer roles with just a few clicks</p>
    </div>
    
    <div class="feature-card">
      <div class="icon">👥</div>
      <h3>Track Volunteers</h3>
      <p>Monitor signups and see who's committed to each role</p>
    </div>
    
    <div class="feature-card">
      <div class="icon">📧</div>
      <h3>Communicate</h3>
      <p>Send reminders and updates directly to volunteers</p>
    </div>
    
    <div class="feature-card">
      <div class="icon">📊</div>
      <h3>Real-time Dashboard</h3>
      <p>View fill status and identify staffing gaps instantly</p>
    </div>
  </div>

  <div class="about">
    <h2>Built for Race Organizers</h2>
    <p>
      Our volunteer management system streamlines the entire process of coordinating 
      volunteers for bicycle racing events. From creating volunteer roles to tracking 
      signups and sending communications, everything is in one place.
    </p>
  </div>
</div>

<style>
  .home {
    max-width: 1000px;
    margin: 0 auto;
  }

  .hero {
    text-align: center;
    padding: 3rem 1rem;
  }

  .hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    color: #1a1a1a;
  }

  .tagline {
    font-size: 1.5rem;
    color: #6c757d;
    margin-bottom: 2rem;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    padding: 1rem 2rem;
    font-size: 1.1rem;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-secondary {
    background: white;
    color: #007bff;
    border: 2px solid #007bff;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin: 4rem 0;
  }

  .feature-card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    transition: transform 0.2s;
  }

  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .feature-card h3 {
    margin-bottom: 0.5rem;
    color: #1a1a1a;
  }

  .feature-card p {
    color: #6c757d;
  }

  .about {
    text-align: center;
    padding: 3rem 1rem;
    background: #f8f9fa;
    border-radius: 12px;
    margin: 2rem 0;
  }

  .about h2 {
    margin-bottom: 1rem;
    color: #1a1a1a;
  }

  .about p {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #495057;
    max-width: 700px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .hero h1 {
      font-size: 2rem;
    }

    .tagline {
      font-size: 1.2rem;
    }

    .features {
      grid-template-columns: 1fr;
    }
  }
</style>

